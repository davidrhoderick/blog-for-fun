import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { runFeatureTests } from './cli'
import type { ManagedEnvironmentOptions } from './environment'

const { execFileSyncMock, managedEnvironmentMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  managedEnvironmentMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFileSync: execFileSyncMock }))
vi.mock('./environment', () => ({
  withManagedEnvironment: managedEnvironmentMock,
}))

const id = 'BLOG-321'
const tag = `@feature-${id}`
const acceptedSha = '1234567890123456789012345678901234567890'
const selectedTest = 'tests/feature.spec.ts'
const listedTest = `[chromium] › ${selectedTest}:8:3 › feature smoke ${tag}`
let root = ''
const managedOptions: ManagedEnvironmentOptions[] = []

beforeEach(() => {
  managedOptions.length = 0
  vi.stubEnv('FEATURE_BASE_URL', undefined)
  vi.stubEnv('JEV_API_KEY', 'review-secret')
  vi.stubEnv('TURSO_CONNECTION_URL', 'libsql://production.example')
  vi.stubEnv('TURSO_AUTH_TOKEN', 'production-db-secret')
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'cloud-key')
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'cloud-secret')
  vi.stubEnv('FEATURE_CAPTURE_DIR', '/tmp/previous-run')
  execFileSyncMock.mockReset()
  execFileSyncMock.mockImplementation(
    (_command: string, args: string[], _options?: unknown) => {
      if (args.includes('--list')) return listedTest
      if (args[0] === 'rev-parse') return Buffer.from(acceptedSha)
      return Buffer.from('')
    },
  )
  managedEnvironmentMock.mockReset()
  managedEnvironmentMock.mockImplementation(
    async (
      options: ManagedEnvironmentOptions,
      run: (environment: {
        baseURL: string
        env: NodeJS.ProcessEnv
      }) => Promise<void>,
    ) => {
      managedOptions.push(options)
      return run({
        baseURL: 'http://127.0.0.1:3123',
        env: {
          ...process.env,
          TURSO_CONNECTION_URL: `file:${options.databasePath}`,
          TURSO_AUTH_TOKEN: 'local-token',
          FEATURE_BASE_URL: 'http://127.0.0.1:3123',
        },
      })
    },
  )
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
  for (const { databasePath } of managedOptions)
    await rm(path.dirname(databasePath), { recursive: true, force: true })
  managedOptions.length = 0
})

const createFeature = async (app: string) => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-cli-'))
  await mkdir(path.join(root, 'docs/features', id), { recursive: true })
  await mkdir(path.join(root, 'tests'), { recursive: true })
  await writeFile(path.join(root, selectedTest), '')
  await writeFile(
    path.join(root, `docs/features/${id}/feature.yaml`),
    `schemaVersion: 2\nid: ${id}\napp: ${app}\nacceptance:\n  acceptedSha: '${acceptedSha}'\n  playwrightTag: '${tag}'\n  tests:\n    - ${selectedTest}\n`,
  )
}

test('uses the manifest app and a disposable database without an external URL', {
  tags: ['integration'],
}, async () => {
  await createFeature('admin')
  const logged = vi.spyOn(console, 'log').mockImplementation(() => {})

  await runFeatureTests(id, 'precheck', false, root)

  expect(managedOptions).toHaveLength(1)
  expect(managedOptions[0]).toMatchObject({
    root,
    app: 'admin',
    removeDatabase: true,
  })
  expect(path.isAbsolute(managedOptions[0].databasePath)).toBe(true)
  expect(path.relative(tmpdir(), managedOptions[0].databasePath)).not.toMatch(
    /^\.\./,
  )
  const playback = execFileSyncMock.mock.calls.find(
    ([, args]) => args.includes('--grep') && !args.includes('--list'),
  )
  expect(playback?.[1]).toContain('(^|\\s)@feature-BLOG-321(\\s|$)')
  expect(playback?.[1]).toContain(selectedTest)
  expect(playback?.[2].env).toMatchObject({
    FEATURE_BASE_URL: 'http://127.0.0.1:3123',
    TURSO_CONNECTION_URL: `file:${managedOptions[0].databasePath}`,
    TURSO_AUTH_TOKEN: 'local-token',
  })
  expect(playback?.[2].env.JEV_API_KEY).toBeUndefined()
  expect(playback?.[2].env.AWS_ACCESS_KEY_ID).toBeUndefined()
  expect(playback?.[2].env.FEATURE_CAPTURE_DIR).toBeUndefined()
  expect(JSON.parse(logged.mock.calls[0][0]).environmentProfile).toBe('managed')
  expect(JSON.parse(logged.mock.calls[0][0]).testCount).toBe(1)
  await expect(
    access(path.dirname(managedOptions[0].databasePath)),
  ).rejects.toThrow()
})

test('keeps an explicit loopback URL external and skips managed startup', {
  tags: ['integration'],
}, async () => {
  await createFeature('blog')
  vi.stubEnv('FEATURE_BASE_URL', 'http://127.0.0.1:3210')

  await runFeatureTests(id, 'e2e', false, root)

  expect(managedEnvironmentMock).not.toHaveBeenCalled()
  const playback = execFileSyncMock.mock.calls.find(
    ([, args]) => args.includes('--grep') && !args.includes('--list'),
  )
  expect(playback?.[1]).toContain('(^|\\s)@feature-BLOG-321(\\s|$)')
  expect(playback?.[2].env.FEATURE_BASE_URL).toBe('http://127.0.0.1:3210/')
  expect(playback?.[2].env.JEV_API_KEY).toBeUndefined()
  expect(playback?.[2].env.TURSO_CONNECTION_URL).toBeUndefined()
  expect(playback?.[2].env.AWS_ACCESS_KEY_ID).toBeUndefined()
  expect(playback?.[2].env.FEATURE_CAPTURE_DIR).toBeUndefined()
  expect(playback?.[1]).toContain(selectedTest)
})

test('rejects a non-loopback external URL before listing tests', {
  tags: ['integration'],
}, async () => {
  await createFeature('blog')
  vi.stubEnv('FEATURE_BASE_URL', 'https://production.example')

  await expect(runFeatureTests(id, 'e2e', false, root)).rejects.toThrow(
    /loopback/i,
  )

  expect(execFileSyncMock).not.toHaveBeenCalled()
  expect(managedEnvironmentMock).not.toHaveBeenCalled()
})

test('rejects an invalid app before listing or running tests', {
  tags: ['integration'],
}, async () => {
  await createFeature('storefront')

  await expect(runFeatureTests(id, 'precheck', false, root)).rejects.toThrow(
    /app/i,
  )

  expect(execFileSyncMock).not.toHaveBeenCalled()
  expect(managedEnvironmentMock).not.toHaveBeenCalled()
})

test('rejects zero selected tests before starting a managed app', {
  tags: ['integration'],
}, async () => {
  await createFeature('blog')
  execFileSyncMock.mockImplementation((_command: string, args: string[]) =>
    args.includes('--list') ? 'No tests found' : Buffer.from(''),
  )

  await expect(runFeatureTests(id, 'precheck', false, root)).rejects.toThrow(
    /No tests selected/,
  )

  expect(managedEnvironmentMock).not.toHaveBeenCalled()
  expect(
    execFileSyncMock.mock.calls.some(
      ([, args]) => args.includes('playwright') && args.includes('--list'),
    ),
  ).toBe(true)
  expect(
    execFileSyncMock.mock.calls.some(
      ([, args]) => args.includes('playwright') && !args.includes('--list'),
    ),
  ).toBe(false)
})

test('removes its temporary database directory when the run fails', {
  tags: ['integration'],
}, async () => {
  await createFeature('blog')
  execFileSyncMock.mockImplementation((_command: string, args: string[]) => {
    if (args.includes('--list')) return listedTest
    if (args[0] === 'rev-parse') return Buffer.from(acceptedSha)
    throw new Error('Playwright failed')
  })

  await expect(runFeatureTests(id, 'e2e', false, root)).rejects.toThrow(
    'Playwright failed',
  )

  expect(managedOptions).toHaveLength(1)
  await expect(
    access(path.dirname(managedOptions[0].databasePath)),
  ).rejects.toThrow()
})
