// Generic engine config shape. The values live in project/config.ts.

export const DEFAULT_IGNORE = [
  '*.generated.ts',
  'apps/admin/app/__generated__/**',
  '.serena/**',
  '**/*.md',
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
  }
  thresholds: {
    maxFileLines: number
    maxFunctionLines: number
    maxNesting: number
    maxCognitiveComplexity: number
    duplication: number
    coverage: number
  }
  ignore: string[]
  /** Repo root the stage commands run from. */
  root: string
  /** Port whose listener means the codegen watcher is already up. */
  devServerPort: number
}
