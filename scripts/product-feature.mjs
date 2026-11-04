import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import path from 'node:path'

const featureIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const localEnvironment =
  'TURSO_CONNECTION_URL=file:local.db\nTURSO_AUTH_TOKEN=local-token\n'

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--resume') {
      options.resume = true
      continue
    }
    if (!['--id', '--app', '--base-ref'].includes(flag))
      throw new Error(`Unknown option: ${flag}`)
    const value = args[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} requires a value`)
    options[{ '--id': 'id', '--app': 'app', '--base-ref': 'baseRef' }[flag]] =
      value
  }

  if (!options.id) throw new Error('Pass --id <FEATURE_ID>')
  if (!featureIdPattern.test(options.id))
    throw new Error(`Invalid feature ID: ${options.id}`)
  if (!['admin', 'blog'].includes(options.app))
    throw new Error('--app must be admin or blog')
  if (options.resume && options.baseRef)
    throw new Error('--resume cannot be combined with --base-ref')
  return options
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
}

function refExists(root, ref) {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', ref], {
    cwd: root,
    stdio: 'ignore',
  })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw result.error ?? new Error(`Could not inspect Git ref ${ref}`)
}

function remoteBranchExists(root, branch) {
  const result = spawnSync(
    'git',
    ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (result.status !== 0)
    throw result.error ?? new Error('Could not inspect origin branches')
  return result.stdout.trim() !== ''
}

function pathExists(target) {
  try {
    lstatSync(target)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function worktrees(root) {
  return git(root, ['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .filter(Boolean)
    .map((entry) => ({
      path: entry.match(/^worktree (.+)$/m)?.[1],
      branch: entry.match(/^branch (.+)$/m)?.[1],
    }))
}

function readEnvFileValue(file, name) {
  if (!existsSync(file)) return undefined
  const original = { ...process.env }
  try {
    delete process.env[name]
    process.loadEnvFile(file)
    return process.env[name]
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, original)
  }
}

function isLocalFileURL(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'file:' &&
      (!url.hostname || url.hostname === 'localhost')
    )
  } catch {
    return false
  }
}

function isLocalStorageEndpoint(value) {
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

async function validateLocalEnv(root) {
  const file = path.join(root, 'apps/server/.env')
  const url = readEnvFileValue(file, 'TURSO_CONNECTION_URL')
  if (url && !isLocalFileURL(url))
    throw new Error(`Refusing non-local database in ${file}`)
  const storageEndpoint = readEnvFileValue(file, 'AWS_ENDPOINT_URL_S3')
  if (storageEndpoint && !isLocalStorageEndpoint(storageEndpoint))
    throw new Error(`Refusing non-local storage endpoint in ${file}`)
  return file
}

async function ensureLocalEnv(root) {
  const file = await validateLocalEnv(root)
  if (!existsSync(file)) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, localEnvironment, { flag: 'wx' })
  }
}

function selectedBase(root, baseRef) {
  if (!baseRef) {
    git(root, ['fetch', 'origin', 'main'])
    baseRef = 'origin/main'
  } else if (baseRef.startsWith('origin/')) {
    git(root, ['fetch', 'origin', '--', baseRef.slice('origin/'.length)])
  }
  return git(root, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${baseRef}^{commit}`,
  ])
}

function assertClean(root) {
  const status = git(root, ['status', '--porcelain', '--untracked-files=all'])
  if (status) throw new Error(`Baseline worktree is not clean:\n${status}`)
}

function localProcessEnvironment(source = process.env) {
  const env = { ...source }
  for (const name of Object.keys(env)) {
    if (
      /^(AWS|TURSO)_/.test(name) ||
      [
        'BUCKET_NAME',
        'S3_FORCE_PATH_STYLE',
        'MEDIA_PUBLIC_URL',
        'FEATURE_BASE_URL',
      ].includes(name)
    ) {
      delete env[name]
    }
  }
  delete env.JEV_API_KEY
  return env
}

function resumeWorktree(root, target, branch, id, app) {
  const entry = worktrees(root).find(
    (worktree) => path.resolve(worktree.path) === target,
  )
  if (!entry || entry.branch !== `refs/heads/${branch}`)
    throw new Error(`Cannot resume: expected ${branch} at ${target}`)

  const markerPath = path.join(
    target,
    'apps/server/.local',
    `product-${id}.json`,
  )
  let marker
  try {
    marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot resume without a valid setup marker: ${markerPath}`,
      {
        cause: error,
      },
    )
  }
  if (
    marker.schemaVersion !== 1 ||
    marker.id !== id ||
    marker.app !== app ||
    !/^[a-f\d]{40}$/i.test(marker.baseSha)
  ) {
    throw new Error(
      `Cannot resume: setup marker does not match ${id} and ${app}`,
    )
  }
  const baseIsAncestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', marker.baseSha, 'HEAD'],
    { cwd: target, stdio: 'ignore' },
  )
  if (baseIsAncestor.status !== 0)
    throw new Error(
      'Cannot resume: setup base is not an ancestor of the branch',
    )
  console.info(`Resuming ${branch}; base ${marker.baseSha}`)
}

async function writeResumeMarker(target, id, app, baseSha) {
  const directory = path.join(target, 'apps/server/.local')
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, `product-${id}.json`),
    `${JSON.stringify({ schemaVersion: 1, id, app, baseSha })}\n`,
    { flag: 'wx' },
  )
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const root = process.cwd()
  const branch = `product/${options.id}`
  const target = path.resolve(root, '.worktrees', options.id)
  const safeEnv = localProcessEnvironment()

  if (options.resume) {
    resumeWorktree(root, target, branch, options.id, options.app)
    await validateLocalEnv(target)
  } else {
    if (pathExists(target) || refExists(root, `refs/heads/${branch}`))
      throw new Error(`Branch or worktree already exists for ${options.id}`)
    if (remoteBranchExists(root, branch))
      throw new Error(`Origin already has branch ${branch}`)

    const baseSha = selectedBase(root, options.baseRef)
    console.info(`Base ${baseSha}`)
    git(root, ['worktree', 'add', '-b', branch, target, baseSha])
    await validateLocalEnv(target)

    run('pnpm', ['install', '--frozen-lockfile'], target, safeEnv)
    assertClean(target)
    await writeResumeMarker(target, options.id, options.app, baseSha)
  }

  if (options.resume)
    run('pnpm', ['install', '--frozen-lockfile'], target, safeEnv)
  await ensureLocalEnv(target)

  const database = path.join(
    target,
    'apps/server/.local',
    `product-${options.id}.db`,
  )
  run(
    'pnpm',
    [
      '--filter',
      'trust-pipeline',
      'exec',
      'tsx',
      'feature/environment.ts',
      'run',
      '--app',
      options.app,
      '--database',
      database,
      '--',
      'pnpm',
      'product',
    ],
    target,
    safeEnv,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
