import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test } from 'vitest'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const launcher = path.join(projectRoot, 'scripts/product-feature.mjs')
let root = ''

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

const git = (cwd: string, args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(result.stderr || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

const createRepo = async (stacked = false) => {
  root = await mkdtemp(path.join(tmpdir(), 'product-launcher-'))
  const repo = path.join(root, 'repo')
  const remote = path.join(root, 'origin.git')
  const bin = path.join(root, 'bin')
  const log = path.join(root, 'pnpm.jsonl')
  git(root, ['init', '--bare', '--initial-branch=main', remote])
  git(root, ['clone', remote, repo])
  git(repo, ['config', 'user.name', 'Product Launcher Test'])
  git(repo, ['config', 'user.email', 'product-launcher@example.test'])
  await mkdirForRepo(repo)
  await writeFile(
    path.join(repo, '.gitignore'),
    'node_modules\n.env\ntrust-pipeline/.env\napps/server/.env\napps/server/.local/\n.worktrees/\n',
  )
  await writeFile(path.join(repo, 'package.json'), '{"name":"launcher-test"}\n')
  await writeFile(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  await writeFile(path.join(repo, 'base.txt'), 'main\n')
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-m', 'base'])
  git(repo, ['push', '-u', 'origin', 'main'])
  let baseRef = 'origin/main'
  if (stacked) {
    git(repo, ['switch', '-c', 'topic/product-base'])
    await writeFile(path.join(repo, 'stack.txt'), 'stack\n')
    git(repo, ['add', 'stack.txt'])
    git(repo, ['commit', '-m', 'stack base'])
    git(repo, ['push', '-u', 'origin', 'topic/product-base'])
    baseRef = 'origin/topic/product-base'
  }
  const baseSha = git(repo, ['rev-parse', baseRef])
  await mkdirForRepo(path.join(repo, 'trust-pipeline'))
  await writeFile(
    path.join(repo, 'trust-pipeline/.env'),
    'JEV_API_KEY=review-secret-from-file\n',
  )
  await mkdirForRepo(bin)
  await writeFile(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const kind = args[0] === 'install' ? 'install'
  : args.includes('verify') ? 'verify'
  : args.includes('feature/environment.ts') ? 'environment' : 'other'
appendFileSync(process.env.PRODUCT_LAUNCHER_LOG, JSON.stringify({ kind, args, base: process.env.VERIFY_BASE_REF, key: process.env.JEV_API_KEY, database: process.env.TURSO_CONNECTION_URL, token: process.env.TURSO_AUTH_TOKEN, awsKey: process.env.AWS_ACCESS_KEY_ID, endpoint: process.env.AWS_ENDPOINT_URL_S3, featureURL: process.env.FEATURE_BASE_URL, cwd: process.cwd() }) + '\\n')
if (kind === 'verify' && process.env.FAIL_VERIFY === '1') process.exit(9)
`,
  )
  await chmod(path.join(bin, 'pnpm'), 0o755)
  return { repo, bin, log, baseSha }
}

const mkdirForRepo = async (directory: string) =>
  import('node:fs/promises').then(({ mkdir }) =>
    mkdir(directory, { recursive: true }),
  )

const runLauncher = (
  repo: string,
  bin: string,
  log: string,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PATH: `${bin}:${process.env.PATH}`,
    PRODUCT_LAUNCHER_LOG: log,
  }
  delete env.JEV_API_KEY
  return spawnSync(process.execPath, [launcher, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env,
  })
}

const readEvents = async (log: string) =>
  (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

test('creates from fetched main without running baseline verification', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log, baseSha } = await createRepo()
  const result = runLauncher(
    repo,
    bin,
    log,
    ['--id', 'INS-123', '--app', 'blog'],
    {
      TURSO_CONNECTION_URL: 'libsql://production.example',
      TURSO_AUTH_TOKEN: 'test-token',
      AWS_ACCESS_KEY_ID: 'cloud-key',
      AWS_SECRET_ACCESS_KEY: 'cloud-secret',
      AWS_ENDPOINT_URL_S3: 'https://storage.example',
      FEATURE_BASE_URL: 'https://production.example',
    },
  )

  expect(result.status).toBe(0)
  expect(git(repo, ['rev-parse', 'product/INS-123'])).toBe(baseSha)
  expect(
    git(repo, [
      '-C',
      path.join(repo, '.worktrees/INS-123'),
      'branch',
      '--show-current',
    ]),
  ).toBe('product/INS-123')
  expect(result.stdout).toContain(baseSha)
  expect(
    JSON.parse(
      await readFile(
        path.join(
          repo,
          '.worktrees/INS-123/apps/server/.local/product-INS-123.json',
        ),
        'utf8',
      ),
    ),
  ).toEqual({ schemaVersion: 1, id: 'INS-123', app: 'blog', baseSha })

  const events = await readEvents(log)
  expect(events.map((event) => event.kind)).toEqual(['install', 'environment'])
  expect(events[0].key).toBeUndefined()
  expect(events[0].database).toBeUndefined()
  expect(events[0].token).toBeUndefined()
  expect(events[0].awsKey).toBeUndefined()
  expect(events[0].endpoint).toBeUndefined()
  expect(events[0].featureURL).toBeUndefined()
  expect(events[1].key).toBeUndefined()
  expect(events[1].database).toBeUndefined()
  expect(events[1].token).toBeUndefined()
  expect(events[1].awsKey).toBeUndefined()
  expect(events[1].endpoint).toBeUndefined()
  expect(events[1].featureURL).toBeUndefined()
  const environmentArgs = events[1].args as string[]
  expect(environmentArgs.slice(-2)).toEqual(['pnpm', 'product'])
  expect(environmentArgs).toContain('blog')
  expect(
    await readFile(
      path.join(repo, '.worktrees/INS-123/apps/server/.env'),
      'utf8',
    ),
  ).toContain('TURSO_CONNECTION_URL=file:local.db')
})

test('uses the explicit stacking base without rebasing the source branch', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log, baseSha } = await createRepo(true)
  const sourceHead = git(repo, ['rev-parse', 'HEAD'])
  const result = runLauncher(repo, bin, log, [
    '--id',
    'INS-124',
    '--app',
    'admin',
    '--base-ref',
    'origin/topic/product-base',
  ])

  expect(result.status).toBe(0)
  expect(git(repo, ['rev-parse', 'product/INS-124'])).toBe(baseSha)
  expect(git(repo, ['rev-parse', 'HEAD'])).toBe(sourceHead)
  expect((await readEvents(log)).map((event) => event.kind)).toEqual([
    'install',
    'environment',
  ])
})

test('does not invoke verification during setup even when it would fail', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()
  const result = runLauncher(
    repo,
    bin,
    log,
    ['--id', 'INS-125', '--app', 'blog'],
    { FAIL_VERIFY: '1' },
  )

  expect(result.status).toBe(0)
  expect((await readEvents(log)).map((event) => event.kind)).toEqual([
    'install',
    'environment',
  ])
})

test('resumes only the exact worktree and preserves local changes', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()
  expect(
    runLauncher(repo, bin, log, ['--id', 'INS-126', '--app', 'blog']).status,
  ).toBe(0)
  const worktree = path.join(repo, '.worktrees/INS-126')
  await writeFile(path.join(worktree, 'base.txt'), 'product edit\n')
  await writeFile(path.join(worktree, 'untracked.txt'), 'keep me\n')
  await writeFile(
    path.join(worktree, 'apps/server/.env'),
    'TURSO_CONNECTION_URL=file:custom-local.db\nTURSO_AUTH_TOKEN=local-token\n',
  )
  const before = (await readEvents(log)).length
  expect(
    runLauncher(repo, bin, log, [
      '--id',
      'INS-126',
      '--app',
      'admin',
      '--resume',
    ]).status,
  ).not.toBe(0)
  expect((await readEvents(log)).length).toBe(before)
  const resumed = runLauncher(repo, bin, log, [
    '--id',
    'INS-126',
    '--app',
    'blog',
    '--resume',
  ])

  expect(resumed.status).toBe(0)
  expect(await readFile(path.join(worktree, 'base.txt'), 'utf8')).toBe(
    'product edit\n',
  )
  expect(await readFile(path.join(worktree, 'untracked.txt'), 'utf8')).toBe(
    'keep me\n',
  )
  expect(
    (await readEvents(log)).slice(before).map((event) => event.kind),
  ).toEqual(['install', 'environment'])
  const statusBeforeCollision = git(repo, ['status', '--porcelain'])
  const eventCountBeforeCollision = (await readEvents(log)).length
  expect(
    runLauncher(repo, bin, log, ['--id', 'INS-126', '--app', 'blog']).status,
  ).not.toBe(0)
  expect(git(repo, ['status', '--porcelain'])).toBe(statusBeforeCollision)
  expect((await readEvents(log)).length).toBe(eventCountBeforeCollision)
})

test('rejects a branch registered at the wrong worktree path', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()
  git(repo, ['worktree', 'add', '-b', 'product/INS-127', 'other-path', 'main'])

  const result = runLauncher(repo, bin, log, [
    '--id',
    'INS-127',
    '--app',
    'blog',
    '--resume',
  ])

  expect(result.status).not.toBe(0)
  await expect(readFile(log, 'utf8')).rejects.toThrow()
  expect(git(repo, ['-C', 'other-path', 'branch', '--show-current'])).toBe(
    'product/INS-127',
  )
})

test('rejects invalid IDs, apps, and incompatible resume options before setup', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()

  for (const args of [
    ['--id', '../INS-128', '--app', 'blog'],
    ['--id', 'INS-128', '--app', 'storefront'],
    ['--id', 'INS-128', '--app', 'blog', '--resume', '--base-ref', 'main'],
  ]) {
    expect(runLauncher(repo, bin, log, args).status).not.toBe(0)
  }

  await expect(readFile(log, 'utf8')).rejects.toThrow()
})

test('refuses a non-local base environment before dependency setup', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()
  await mkdirForRepo(path.join(repo, 'apps/server'))
  await writeFile(
    path.join(repo, 'apps/server/.env'),
    'TURSO_CONNECTION_URL=libsql://shared.turso.io\n',
  )
  git(repo, ['add', '-f', 'apps/server/.env'])
  git(repo, ['commit', '-m', 'test remote environment'])
  git(repo, ['push', 'origin', 'main'])

  expect(
    runLauncher(repo, bin, log, ['--id', 'INS-129', '--app', 'blog']).status,
  ).not.toBe(0)
  await expect(readFile(log, 'utf8')).rejects.toThrow()
})

test('refuses a non-local storage endpoint before dependency setup', {
  tags: ['integration'],
}, async () => {
  const { repo, bin, log } = await createRepo()
  await mkdirForRepo(path.join(repo, 'apps/server'))
  await writeFile(
    path.join(repo, 'apps/server/.env'),
    'TURSO_CONNECTION_URL=file:local.db\nAWS_ENDPOINT_URL_S3=https://storage.example\n',
  )
  git(repo, ['add', '-f', 'apps/server/.env'])
  git(repo, ['commit', '-m', 'test remote storage endpoint'])
  git(repo, ['push', 'origin', 'main'])

  expect(
    runLauncher(repo, bin, log, ['--id', 'INS-130', '--app', 'blog']).status,
  ).not.toBe(0)
  await expect(readFile(log, 'utf8')).rejects.toThrow()
})
