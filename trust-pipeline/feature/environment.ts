import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createServer, isIP } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'dotenv'
import type { FeatureApp } from './manifest'

const localToken = 'local-token'
const appPort = { admin: 3001, blog: 3000 } as const
const serverPort = 4000

export type ManagedEnvironmentOptions = {
  root: string
  app: FeatureApp
  databasePath: string
  removeDatabase?: boolean
  ports?: { server: number; app: number }
}

type ManagedEnvironment = {
  baseURL: string
  env: NodeJS.ProcessEnv
  runCommand: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) => Promise<void>
}
type PreparedEnvironment = ManagedEnvironmentOptions & {
  root: string
  databasePath: string
  ports: { server: number; app: number }
  baseEnv: NodeJS.ProcessEnv
  appEnv: NodeJS.ProcessEnv
  baseURL: string
}

const localDatabaseURL = (databasePath: string) => `file:${databasePath}`

async function validateLocalEnvironment(root: string): Promise<void> {
  const environmentFile = path.join(root, 'apps/server/.env')
  const contents = await readFile(environmentFile, 'utf8').catch(
    (error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? '' : Promise.reject(error),
  )
  const configuredURL = parse(contents).TURSO_CONNECTION_URL
  if (configuredURL) {
    const url = new URL(configuredURL)
    if (
      url.protocol !== 'file:' ||
      (url.hostname && url.hostname !== 'localhost')
    )
      throw new Error('Managed environments require a local file database')
  }
  const storageEndpoint = parse(contents).AWS_ENDPOINT_URL_S3
  if (storageEndpoint && !isLocalStorageEndpoint(storageEndpoint))
    throw new Error('Managed environments require a local storage endpoint')
}

function isLocalStorageEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      (hostname === 'localhost' ||
        hostname === '::1' ||
        (isIP(hostname) === 4 && hostname.startsWith('127.')))
    )
  } catch {
    return false
  }
}

function localProcessEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (
      /^(AWS|TURSO)_/.test(name) ||
      [
        'BUCKET_NAME',
        'S3_FORCE_PATH_STYLE',
        'MEDIA_PUBLIC_URL',
        'FEATURE_BASE_URL',
        'JEV_API_KEY',
      ].includes(name)
    ) {
      delete env[name]
    }
  }
  return env
}

function assertTemporaryDatabase(databasePath: string): void {
  const relative = path.relative(path.resolve(tmpdir()), databasePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Disposable database must be inside the OS temp directory')
}

async function assertPortAvailable(port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid local port: ${port}`)

  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', () =>
      reject(new Error(`Managed environment port ${port} is unavailable`)),
    )
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    )
  })
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  children: ChildProcess[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: 'inherit',
    })
    children.push(child)
    const removeChild = () => {
      const index = children.indexOf(child)
      if (index !== -1) children.splice(index, 1)
    }
    child.once('error', (error) => {
      removeChild()
      reject(error)
    })
    child.once('exit', (code, signal) => {
      removeChild()
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${signal ?? code}`))
    })
  })
}

function startProcess(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  return spawn('pnpm', args, {
    cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  })
}

async function waitFor(
  url: string,
  child: ChildProcess,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 60_000
  let spawnError: Error | undefined
  child.once('error', (error) => (spawnError = error))

  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${description} stopped before becoming healthy`)

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`${description} did not become healthy at ${url}`)
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return

  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  )
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }

  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
    await exited
  }
}

async function removeDatabase(databasePath: string): Promise<void> {
  await Promise.all(
    [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map((file) =>
      rm(file, { force: true }),
    ),
  )
}

export async function withManagedEnvironment<T>(
  options: ManagedEnvironmentOptions,
  run: (environment: ManagedEnvironment) => Promise<T>,
): Promise<T> {
  const prepared = await prepareEnvironment(options)
  const children: ChildProcess[] = []
  let stopping: Promise<void> | undefined
  let shutdownRequested = false
  const assertRunning = () => {
    if (shutdownRequested) throw new Error('Managed environment interrupted')
  }
  const stop = () => {
    stopping ??= (async () => {
      for (const child of [...children].reverse()) await stopProcess(child)
    })()
    return stopping
  }
  const onSignal = () => {
    shutdownRequested = true
    void stop()
  }

  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    assertRunning()
    await runCommand(
      'pnpm',
      ['--filter', 'server', 'db:migrate'],
      prepared.root,
      prepared.baseEnv,
      children,
    )
    assertRunning()
    await runCommand(
      'pnpm',
      ['--filter', 'server', 'auth:bootstrap'],
      prepared.root,
      prepared.baseEnv,
      children,
    )
    assertRunning()
    await startServices(prepared, children, assertRunning)
    assertRunning()
    console.info(`Local ${prepared.app} ready at ${prepared.baseURL}`)
    return await run({
      baseURL: prepared.baseURL,
      env: { ...prepared.appEnv, FEATURE_BASE_URL: prepared.baseURL },
      runCommand: (command, args, env) => {
        assertRunning()
        return runCommand(command, args, prepared.root, env, children)
      },
    })
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await stop()
    if (prepared.removeDatabase) await removeDatabase(prepared.databasePath)
  }
}

async function prepareEnvironment(
  options: ManagedEnvironmentOptions,
): Promise<PreparedEnvironment> {
  const root = path.resolve(options.root)
  const databasePath = path.resolve(options.databasePath)
  if (options.app !== 'admin' && options.app !== 'blog')
    throw new Error('Managed environment app must be admin or blog')
  if (!path.isAbsolute(options.databasePath))
    throw new Error('Database path must be absolute')
  if (options.removeDatabase) assertTemporaryDatabase(databasePath)
  await validateLocalEnvironment(root)

  const ports = options.ports ?? {
    server: serverPort,
    app: appPort[options.app],
  }
  if (ports.server === ports.app)
    throw new Error('Server and app must use different ports')
  await assertPortAvailable(ports.server)
  await assertPortAvailable(ports.app)

  await mkdir(path.dirname(databasePath), { recursive: true })
  const baseURL = `http://127.0.0.1:${ports.app}`
  const baseEnv: NodeJS.ProcessEnv = {
    ...localProcessEnvironment(),
    TURSO_CONNECTION_URL: localDatabaseURL(databasePath),
    TURSO_AUTH_TOKEN: localToken,
    BOOTSTRAP_EMAIL: 'dev@example.com',
    BOOTSTRAP_DISPLAY_NAME: 'Dev Admin',
    BOOTSTRAP_PASSWORD: 'dev-only',
    BOOTSTRAP_IF_INITIALIZED: 'true',
    HOST: '127.0.0.1',
    PORT: String(ports.server),
    FEATURE_BASE_URL: baseURL,
  }
  const appEnv = { ...baseEnv }
  delete appEnv.PORT
  return { ...options, root, databasePath, ports, baseEnv, appEnv, baseURL }
}

async function startServices(
  environment: PreparedEnvironment,
  children: ChildProcess[],
  assertRunning: () => void,
): Promise<void> {
  assertRunning()
  const server = startProcess(
    ['--filter', 'server', 'run', 'dev'],
    environment.root,
    environment.baseEnv,
  )
  children.push(server)
  await waitFor(
    `http://127.0.0.1:${environment.ports.server}/health`,
    server,
    'Server',
  )
  assertRunning()

  const app = startProcess(
    [
      '--filter',
      environment.app,
      'run',
      'dev',
      '--',
      '--port',
      String(environment.ports.app),
    ],
    environment.root,
    environment.appEnv,
  )
  children.push(app)
  await waitFor(environment.baseURL, app, `${environment.app} app`)
}

async function runCommandLine(): Promise<void> {
  const [mode, ...args] = process.argv.slice(2)
  if (mode !== 'run')
    throw new Error(
      'Usage: environment.ts run --app <app> --database <path> -- <command>',
    )
  const separator = args.indexOf('--')
  if (separator < 0 || separator === args.length - 1)
    throw new Error('Pass the command to run after --')

  let app: FeatureApp | undefined
  let databasePath: string | undefined
  for (let index = 0; index < separator; index += 1) {
    if (args[index] === '--app') app = args[++index] as FeatureApp
    else if (args[index] === '--database') databasePath = args[++index]
    else throw new Error(`Unknown environment option: ${args[index]}`)
  }
  if (app !== 'admin' && app !== 'blog')
    throw new Error('--app must be admin or blog')
  if (!databasePath) throw new Error('--database is required')

  const scriptPath = fileURLToPath(import.meta.url)
  const root = path.resolve(path.dirname(scriptPath), '../..')
  const [command, ...commandArgs] = args.slice(separator + 1)
  await withManagedEnvironment(
    { root, app, databasePath },
    async ({ env, runCommand }) => {
      await runCommand(command, commandArgs, env)
    },
  )
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  runCommandLine().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
