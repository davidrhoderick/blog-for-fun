import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_IGNORE, type ProjectConfig } from '../engine/config'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const config: ProjectConfig = {
  stages: {
    audit: true,
    lint: true,
    typecheck: true,
    structure: false,
    test: true,
    scans: false,
    review: false,
  },
  commands: {
    audit: 'pnpm audit --audit-level high',
    lint: 'pnpm exec biome check .',
    typecheck: 'pnpm -r --workspace-concurrency=1 run typecheck',
    test: 'pnpm test',
    codegen: 'pnpm codegen',
  },
  thresholds: {
    maxFileLines: 400,
    maxFunctionLines: 80,
    maxNesting: 4,
    maxCognitiveComplexity: 20,
    duplication: 3,
    coverage: 80,
  },
  ignore: DEFAULT_IGNORE,
  root,
  devServerPort: 4000,
}
