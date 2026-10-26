import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  checkClientSuspense,
  checkIgnoreReasons,
  checkSource,
  checkTestTags,
  isIgnored,
  type Violation,
} from '../checks/ast'
import { checkRouteExports } from '../checks/routes'
import type { Stage } from './types'

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?)$/
// Build artifacts and dependencies are never source.
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'build', 'dist'])

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files)
    } else {
      files.push(path.join(dir, entry.name))
    }
  }
  return files
}

export const structureStage: Stage = {
  name: 'structure',
  async run(cfg) {
    const violations: Violation[] = []
    for (const file of walk(cfg.root)) {
      const rel = path.relative(cfg.root, file).split(path.sep).join('/')
      if (!SOURCE_FILE.test(rel)) continue
      const source = readFileSync(file, 'utf8')
      if (isIgnored(rel, cfg.ignore)) {
        // Ignored files are exempt from the size rules, but test files still
        // have to carry a tag, which is where their timeout comes from.
        if (TEST_FILE.test(rel))
          violations.push(...checkTestTags({ filePath: rel, source }))
        continue
      }
      const routeModule = path.matchesGlob(rel, cfg.routeFiles)
      violations.push(
        ...checkSource({
          filePath: rel,
          source,
          maxFileLines: routeModule
            ? cfg.thresholds.maxRouteFileLines
            : cfg.thresholds.maxFileLines,
        }),
      )
      violations.push(...checkIgnoreReasons({ filePath: rel, source }))
      violations.push(...checkClientSuspense({ filePath: rel, source }))
      if (routeModule)
        violations.push(...checkRouteExports({ filePath: rel, source }))
    }
    return {
      name: 'structure',
      ok: violations.length === 0,
      output: violations
        .map((v) => `${v.file}:${v.line} ${v.rule}: ${v.message}`)
        .join('\n'),
    }
  },
}
