import { spawn } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { withManagedEnvironment } from './environment'

let root = ''

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

const freePort = async () => {
  const server = createTcpServer()
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP port')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

const setup = async () => {
  root = await mkdtemp(path.join(tmpdir(), 'managed-environment-'))
  const bin = path.join(root, 'bin')
  const log = path.join(root, 'events.jsonl')
  await mkdir(bin)
  await writeFile(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env node
const { appendFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { dirname } = require('node:path')
const { fileURLToPath } = require('node:url')
const { createServer } = require('node:http')
const args = process.argv.slice(2)
const kind = args.includes('db:migrate') ? 'migrate'
  : args.includes('auth:bootstrap') ? 'bootstrap'
  : args.includes('server') ? 'server' : 'app'
const log = (event) => appendFileSync(process.env.MANAGED_ENV_TEST_LOG, JSON.stringify(event) + '\\n')
log({ kind, url: process.env.TURSO_CONNECTION_URL, token: process.env.TURSO_AUTH_TOKEN, bootstrap: process.env.BOOTSTRAP_IF_INITIALIZED, port: process.env.PORT, awsKey: process.env.AWS_ACCESS_KEY_ID, endpoint: process.env.AWS_ENDPOINT_URL_S3, jev: process.env.JEV_API_KEY, featureURL: process.env.FEATURE_BASE_URL, args })
if (kind === 'migrate') {
  const database = fileURLToPath(new URL(process.env.TURSO_CONNECTION_URL))
  mkdirSync(dirname(database), { recursive: true })
  writeFileSync(database, '')
  process.exit(0)
}
if (kind === 'bootstrap') process.exit(0)
const appPort = args[args.indexOf('--port') + 1]
const port = Number(kind === 'server' ? process.env.PORT : appPort)
const server = createServer((_request, response) => { response.statusCode = 200; response.end(kind) })
const stop = () => server.close(() => { log({ kind: 'stopped', process: process.pid }); process.exit(0) })
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setTimeout(() => server.listen(port, '127.0.0.1'), 40)
`,
  )
  await chmod(path.join(bin, 'pnpm'), 0o755)
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  vi.stubEnv('MANAGED_ENV_TEST_LOG', log)
  return { log }
}

const events = async (log: string) =>
  (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

const waitForEvent = async (log: string, kind: string) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const found = await events(log)
      .then((items) => items.some((item) => item.kind === kind))
      .catch(() => false)
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${kind}`)
}

test('starts the selected local app and stops only its own processes', {
  tags: ['integration'],
}, async () => {
  const { log } = await setup()
  vi.stubEnv('TURSO_CONNECTION_URL', 'libsql://production.example')
  vi.stubEnv('TURSO_AUTH_TOKEN', 'production-db-secret')
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'cloud-key')
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'cloud-secret')
  vi.stubEnv('AWS_ENDPOINT_URL_S3', 'https://storage.example')
  vi.stubEnv('JEV_API_KEY', 'review-secret')
  vi.stubEnv('FEATURE_BASE_URL', 'https://production.example')
  const readiness = vi.spyOn(console, 'info').mockImplementation(() => {})
  const expectedReadiness: string[] = []
  const expectedFeatureURLs: string[] = []

  for (const app of ['admin', 'blog'] as const) {
    const databasePath = path.join(root, `${app}.db`)
    const serverPort = await freePort()
    const appPort = await freePort()
    expectedReadiness.push(`Local ${app} ready at http://127.0.0.1:${appPort}`)
    expectedFeatureURLs.push(
      ...Array.from({ length: 4 }, () => `http://127.0.0.1:${appPort}`),
    )
    const result = await withManagedEnvironment(
      {
        root,
        app,
        databasePath,
        removeDatabase: true,
        ports: { server: serverPort, app: appPort },
      },
      async ({ baseURL, env }) => {
        expect(env.TURSO_CONNECTION_URL).toBe(`file:${databasePath}`)
        expect(env.TURSO_AUTH_TOKEN).toBe('local-token')
        expect(
          (await fetch(`http://127.0.0.1:${serverPort}/health`)).status,
        ).toBe(200)
        const appResponse = await fetch(baseURL)
        expect(appResponse.status).toBe(200)
        return await appResponse.text()
      },
    )

    expect(result).toBe('app')
  }

  const recorded = await events(log)
  const starts = recorded.filter((event) => event.kind !== 'stopped')
  expect(starts.map((event) => event.kind)).toEqual([
    'migrate',
    'bootstrap',
    'server',
    'app',
    'migrate',
    'bootstrap',
    'server',
    'app',
  ])
  expect(
    starts.every((event) =>
      [
        `file:${path.join(root, 'admin.db')}`,
        `file:${path.join(root, 'blog.db')}`,
      ].includes(event.url as string),
    ),
  ).toBe(true)
  expect(starts.every((event) => event.token === 'local-token')).toBe(true)
  expect(
    starts
      .filter((event) => event.kind === 'app')
      .map((event) => (event.args as string[])[1]),
  ).toEqual(['admin', 'blog'])
  expect(
    starts
      .filter((event) => event.kind === 'bootstrap')
      .every((event) => event.bootstrap === 'true'),
  ).toBe(true)
  expect(starts.every((event) => event.awsKey === undefined)).toBe(true)
  expect(starts.every((event) => event.endpoint === undefined)).toBe(true)
  expect(starts.every((event) => event.jev === undefined)).toBe(true)
  expect(starts.map((event) => event.featureURL)).toEqual(expectedFeatureURLs)
  expect(recorded.filter((event) => event.kind === 'stopped')).toHaveLength(4)
  expect(readiness.mock.calls.map(([message]) => message)).toEqual(
    expectedReadiness,
  )
})

test('refuses an occupied port without disturbing its owner', {
  tags: ['integration'],
}, async () => {
  const { log } = await setup()
  const port = await freePort()
  const owner = createHttpServer((_request, response) => {
    response.end('unrelated owner')
  })
  await new Promise<void>((resolve) => owner.listen(port, '127.0.0.1', resolve))
  const appPort = await freePort()

  try {
    await expect(
      withManagedEnvironment(
        {
          root,
          app: 'blog',
          databasePath: path.join(root, 'occupied.db'),
          ports: { server: port, app: appPort },
        },
        async () => undefined,
      ),
    ).rejects.toThrow(/port/i)
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe(
      'unrelated owner',
    )
    await expect(readFile(log, 'utf8')).rejects.toThrow()
  } finally {
    await new Promise<void>((resolve, reject) =>
      owner.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

test('refuses a non-local server .env before running migrations', {
  tags: ['integration'],
}, async () => {
  const { log } = await setup()
  await mkdir(path.join(root, 'apps/server'), { recursive: true })
  await writeFile(
    path.join(root, 'apps/server/.env'),
    'TURSO_CONNECTION_URL=libsql://shared.turso.io\n',
  )

  await expect(
    withManagedEnvironment(
      {
        root,
        app: 'blog',
        databasePath: path.join(root, 'remote-refused.db'),
      },
      async () => undefined,
    ),
  ).rejects.toThrow(/local file database/i)
  await expect(readFile(log, 'utf8')).rejects.toThrow()
})

test('refuses a non-local storage endpoint before running migrations', {
  tags: ['integration'],
}, async () => {
  const { log } = await setup()
  await mkdir(path.join(root, 'apps/server'), { recursive: true })
  await writeFile(
    path.join(root, 'apps/server/.env'),
    'TURSO_CONNECTION_URL=file:local.db\nAWS_ENDPOINT_URL_S3=https://storage.example\n',
  )

  await expect(
    withManagedEnvironment(
      {
        root,
        app: 'blog',
        databasePath: path.join(root, 'remote-storage-refused.db'),
      },
      async () => undefined,
    ),
  ).rejects.toThrow(/local storage endpoint/i)
  await expect(readFile(log, 'utf8')).rejects.toThrow()
})

test('stops managed services when interrupted', {
  tags: ['integration'],
}, async () => {
  const { log } = await setup()
  const serverPort = await freePort()
  const appPort = await freePort()
  const rootPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  )
  const moduleURL = pathToFileURL(
    path.join(rootPath, 'trust-pipeline/feature/environment.ts'),
  ).href
  const harness = path.join(root, 'signal-test.mts')
  await writeFile(
    harness,
    `import { appendFileSync } from 'node:fs'
import { withManagedEnvironment } from ${JSON.stringify(moduleURL)}
await withManagedEnvironment({ root: ${JSON.stringify(root)}, app: 'blog', databasePath: ${JSON.stringify(path.join(root, 'signal.db'))}, ports: { server: ${serverPort}, app: ${appPort} } }, async () => {
  appendFileSync(process.env.MANAGED_ENV_TEST_LOG!, JSON.stringify({ kind: 'ready' }) + '\\n')
  await new Promise<void>((resolve) => process.once('SIGINT', resolve))
})
`,
  )
  const tsx = path.join(rootPath, 'trust-pipeline/node_modules/.bin/tsx')
  const child = spawn(tsx, [harness], {
    cwd: rootPath,
    detached: true,
    env: {
      ...process.env,
      MANAGED_ENV_TEST_LOG: log,
      PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
    },
    stdio: 'inherit',
  })

  try {
    await waitForEvent(log, 'ready')
    if (!child.pid) throw new Error('Signal test process did not start')
    process.kill(-child.pid, 'SIGINT')
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', () => resolve())
    })
    expect(
      (await events(log)).filter((event) => event.kind === 'stopped'),
    ).toHaveLength(2)
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid)
      process.kill(-child.pid, 'SIGKILL')
  }
})
