import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'
import { config } from '../config'

const PATTERNS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(PATTERNS_DIR, '../../..')

/** Every package that declares its own coverage thresholds. */
const COVERAGE_CONFIGS = [
  'apps/admin/vitest.config.ts',
  'apps/blog/vitest.config.ts',
  'apps/server/vitest.config.ts',
  'packages/graphql-runtime/vitest.config.ts',
  'packages/ui/vitest.config.ts',
]

const readRepoFile = (rel: string) =>
  readFileSync(path.join(REPO_ROOT, rel), 'utf8')

/** The declared value of `name`, or NaN when the config does not declare it. */
const declared = (block: string, name: string): number =>
  Number(new RegExp(`${name}:\\s*(\\d+)`).exec(block)?.[1])

test('no package declares a coverage threshold below the configured floor', {
  tags: ['integration'],
}, () => {
  const floor = config.thresholds.coverage
  for (const rel of COVERAGE_CONFIGS) {
    const block = /thresholds:\s*\{([^}]*)\}/.exec(readRepoFile(rel))?.[1] ?? ''
    for (const metric of ['lines', 'branches']) {
      expect(
        declared(block, metric),
        `${rel} must declare a ${metric} threshold at or above ${floor}`,
      ).toBeGreaterThanOrEqual(floor)
    }
  }
})

test('coverage excludes stay per-file', { tags: ['integration'] }, () => {
  for (const rel of COVERAGE_CONFIGS) {
    const block = /exclude:\s*\[([^\]]*)\]/.exec(readRepoFile(rel))?.[1] ?? ''
    for (const [, pattern = ''] of block.matchAll(/'([^']+)'/g)) {
      // Test and generated files may use a glob; anything else must name one
      // file, so an untested directory can never be hidden wholesale.
      const perFile =
        !pattern.includes('*') ||
        pattern.includes('.test.') ||
        pattern.includes('.generated.') ||
        pattern.includes('__generated__')
      expect(perFile, `${rel} excludes ${pattern}, which is not per-file`).toBe(
        true,
      )
    }
  }
})

const APP_DIRS = ['apps', 'packages']
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const SKIP =
  /(?:^|\/)(?:node_modules|build|dist|coverage|\.react-router|__generated__)(?:\/|$)/
const PIPELINE_DIR = path.join(REPO_ROOT, 'trust-pipeline')

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/')
    if (SKIP.test(rel)) continue
    if (entry.isDirectory()) walkSources(full, out)
    else if (SOURCE.test(entry.name)) out.push(full)
  }
  return out
}

test('app code stays free of pipeline infrastructure', {
  tags: ['integration'],
}, () => {
  const offenders: string[] = []
  for (const dir of APP_DIRS) {
    for (const file of walkSources(path.join(REPO_ROOT, dir))) {
      const { importedFiles } = ts.preProcessFile(
        readFileSync(file, 'utf8'),
        true,
        true,
      )
      for (const { fileName } of importedFiles) {
        const intoPipeline =
          fileName === 'trust-pipeline' ||
          fileName.startsWith('trust-pipeline/') ||
          (fileName.startsWith('.') &&
            path
              .resolve(path.dirname(file), fileName)
              .startsWith(`${PIPELINE_DIR}${path.sep}`))
        if (intoPipeline)
          offenders.push(`${path.relative(REPO_ROOT, file)} → ${fileName}`)
      }
    }
  }

  expect(offenders).toEqual([])
})

const SERVER_SRC = path.join(REPO_ROOT, 'apps/server/src')
const DB_DIR = path.join(SERVER_SRC, 'db')
const DB_SCHEMA = path.join(DB_DIR, 'schema')
/** Mappers: `to*` modules under services, which may only map. */
const MAPPER = /^apps\/server\/src\/services\/.*\/to[^/]+\.ts$/

const repoPath = (file: string) =>
  path.relative(REPO_ROOT, file).split(path.sep).join('/')

/** One file's relative imports, resolved, so a target can be classified. */
function relativeImports(file: string): string[] {
  const { importedFiles } = ts.preProcessFile(
    readFileSync(file, 'utf8'),
    true,
    true,
  )
  return importedFiles
    .filter(({ fileName }) => fileName.startsWith('.'))
    .map(({ fileName }) => path.resolve(path.dirname(file), fileName))
}

test('mappers read types from db/schema but never the db client', {
  tags: ['integration'],
}, () => {
  const offenders: string[] = []
  for (const file of walkSources(path.join(SERVER_SRC, 'services'))) {
    if (!MAPPER.test(repoPath(file))) continue
    for (const target of relativeImports(file)) {
      const typesOnly =
        target === DB_SCHEMA || target.startsWith(`${DB_SCHEMA}${path.sep}`)
      if (target.startsWith(DB_DIR) && !typesOnly)
        offenders.push(`${repoPath(file)} → ${repoPath(target)}`)
    }
  }

  expect(offenders).toEqual([])
})

test('the db layer imports nothing above it', { tags: ['integration'] }, () => {
  const layers = ['services', 'auth', 'schema'].map((dir) =>
    path.join(SERVER_SRC, dir),
  )
  const entry = path.join(SERVER_SRC, 'server.ts')
  const offenders: string[] = []
  for (const file of walkSources(DB_DIR)) {
    for (const target of relativeImports(file)) {
      const above =
        target === entry ||
        layers.some(
          (dir) => target === dir || target.startsWith(`${dir}${path.sep}`),
        )
      if (above) offenders.push(`${repoPath(file)} → ${repoPath(target)}`)
    }
  }

  expect(offenders).toEqual([])
})

test('the env module imports nothing from the app', {
  tags: ['integration'],
}, () => {
  expect(relativeImports(path.join(SERVER_SRC, 'lib/env.ts'))).toEqual([])
})
