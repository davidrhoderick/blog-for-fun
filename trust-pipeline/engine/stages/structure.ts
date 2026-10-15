import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { checkSource, isIgnored, type Violation } from '../checks/ast'
import type { Stage } from './types'

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/
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
      if (!SOURCE_FILE.test(rel) || isIgnored(rel, cfg.ignore)) continue
      violations.push(
        ...checkSource({ filePath: rel, source: readFileSync(file, 'utf8') }),
      )
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
