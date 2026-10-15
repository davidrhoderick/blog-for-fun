import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { filesOfProject } from 'tsarch'
import { afterAll, expect, test } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const serverTsconfig = path.join(repoRoot, 'apps/server/tsconfig.json')
const originalCwd = process.cwd()

// tsarch resolves `paths` aliases relative to the process cwd, so the alias
// fixture below chdirs into its own directory; restore it afterwards.
afterAll(() => process.chdir(originalCwd))

// Generated and test files are not shipped source (docs/architecture.md).
// tsarch reads `fileCondition` from a single precondition pattern, so both
// guards are folded into one regex rather than chained (chaining loses the
// tsconfig path and silently falls back to a guessed project).
// Labels are relative to the tsconfig root (`apps/server`), so server files are
// `src/...`, not `.../src/...` — SERVER_SOURCE must anchor at `src/` or it
// matches no node and the cycle rule checks nothing.
const RESOLVERS = '^(?!.*\\.generated\\.)(?!.*\\.test\\.).*/resolvers/.*'
const SERVER_SOURCE = '^(?!.*\\.generated\\.)(?!.*\\.test\\.)src/.*'

test('resolvers do not depend on other resolvers', {
  tags: ['integration'],
}, async () => {
  const violations = await filesOfProject(serverTsconfig)
    .matchingPattern(RESOLVERS)
    .shouldNot()
    .dependOnFiles()
    .inFolder('resolvers')
    .check()

  expect(violations).toEqual([])
})

test('resolvers do not touch the database', {
  tags: ['integration'],
}, async () => {
  const violations = await filesOfProject(serverTsconfig)
    .matchingPattern(RESOLVERS)
    .shouldNot()
    .dependOnFiles()
    .inFolder('db')
    .check()

  expect(violations).toEqual([])
})

test('the server source graph is cycle-free', {
  tags: ['integration'],
}, async () => {
  const violations = await filesOfProject(serverTsconfig)
    .matchingPattern(SERVER_SOURCE)
    .should()
    .beFreeOfCycles()
    .check()

  expect(violations).toEqual([])
})

// Pins the Review Focus: tsarch must resolve workspace aliases (@blog/ui).
// Without the tsconfig `paths` mapping the dependency is dropped silently, so a
// violating import would pass the rule (a false negative).
test('resolves a workspace alias without false positives', {
  tags: ['integration'],
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tsarch-alias-'))
  try {
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'node',
          baseUrl: '.',
          paths: { '@blog/ui': ['src/ui'] },
          strict: true,
          skipLibCheck: true,
        },
        include: ['**/*'],
        exclude: ['node_modules'],
      }),
    )
    mkdirSync(path.join(dir, 'src/resolvers'), { recursive: true })
    mkdirSync(path.join(dir, 'src/ui'), { recursive: true })
    writeFileSync(
      path.join(dir, 'src/resolvers/thing.ts'),
      "import { helper } from '@blog/ui'\nexport const thing = helper\n",
    )
    writeFileSync(
      path.join(dir, 'src/ui/index.ts'),
      'export const helper = 1\n',
    )

    process.chdir(dir)
    const resolved = await filesOfProject(path.join(dir, 'tsconfig.json'))
      .inFolder('resolvers')
      .shouldNot()
      .dependOnFiles()
      .inFolder('ui')
      .check()
    const clean = await filesOfProject(path.join(dir, 'tsconfig.json'))
      .inFolder('resolvers')
      .shouldNot()
      .dependOnFiles()
      .inFolder('nothing')
      .check()

    expect(resolved).toHaveLength(1)
    expect(clean).toEqual([])
  } finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
})
