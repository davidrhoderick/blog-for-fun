import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_IGNORE, type ProjectConfig } from '../engine/config'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const config: ProjectConfig = {
  stages: {
    audit: true,
    lint: true,
    typecheck: true,
    structure: true,
    test: true,
    scans: true,
    review: true,
  },
  commands: {
    audit: 'pnpm audit --audit-level high',
    lint: 'pnpm exec biome check .',
    typecheck: 'pnpm -r --workspace-concurrency=1 run typecheck',
    test: 'pnpm test',
    codegen: 'pnpm codegen',
    scans: [
      'osv-scanner scan -L pnpm-lock.yaml --format json --config trust-pipeline/project/osv-scanner.toml',
      'opengrep scan --config trust-pipeline/project/rules --severity ERROR --error --disable-version-check --sarif-output report/opengrep.sarif apps packages trust-pipeline',
      'pnpm --filter trust-pipeline exec jscpd --config project/jscpd.json ../apps ../packages ../trust-pipeline',
      'pnpm --filter trust-pipeline exec vitest run --config vitest.arch.config.ts',
    ],
  },
  thresholds: {
    maxFileLines: 400,
    maxRouteFileLines: 150,
    maxFunctionLines: 80,
    maxNesting: 4,
    maxCognitiveComplexity: 20,
    duplication: 3,
    coverage: 80,
  },
  routeFiles: 'apps/*/app/routes/*',
  ignore: DEFAULT_IGNORE,
  root,
}
