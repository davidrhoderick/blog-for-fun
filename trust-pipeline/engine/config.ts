// Generic engine config shape. The values live in project/config.ts.

export const DEFAULT_IGNORE = [
  '*.generated.ts',
  'apps/admin/app/__generated__/**',
  '.serena/**',
  '**/*.md',
  '**/*.test.ts',
  '**/*.test.tsx',
]

export interface ProjectConfig {
  stages: {
    audit: boolean
    lint: boolean
    typecheck: boolean
    structure: boolean
    test: boolean
    scans: boolean
    review: boolean
  }
  commands: {
    audit: string
    lint: string
    typecheck: string
    test: string
    codegen: string
    /** Scan commands, run in order; any non-zero fails the stage. */
    scans: string[]
  }
  thresholds: {
    maxFileLines: number
    /** Route modules hold a loader, action, meta, and page, so they get more. */
    maxRouteFileLines: number
    maxFunctionLines: number
    maxNesting: number
    maxCognitiveComplexity: number
    duplication: number
    coverage: number
  }
  /** Glob for route modules, which are held to the route-specific rules. */
  routeFiles: string
  ignore: string[]
  /** Repo root the stage commands run from. */
  root: string
}
