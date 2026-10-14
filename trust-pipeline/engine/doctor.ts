import type { ProjectConfig } from './config'
import { exec } from './exec'

export type Tool = {
  name: string
  /** Shell command that succeeds when the tool is available. */
  check: string
  /** Copy-pasteable install command. */
  hint: string
  /** Stage that needs it; omitted means every run needs it. */
  stage?: keyof ProjectConfig['stages']
}

export const TOOLS: Tool[] = [
  {
    name: 'node',
    check: 'command -v node',
    hint: 'install Node.js from https://nodejs.org',
  },
  {
    name: 'pnpm',
    check: 'command -v pnpm',
    hint: 'corepack enable && corepack prepare pnpm@11.20.0 --activate',
  },
  {
    name: 'tsx',
    check: 'pnpm exec tsx --version',
    hint: 'cd trust-pipeline && pnpm install',
  },
  {
    name: 'biome',
    check: 'pnpm exec biome --version',
    hint: 'pnpm install',
  },
  {
    name: 'vitest',
    check: 'pnpm exec vitest --version',
    hint: 'cd trust-pipeline && pnpm install',
  },
  {
    name: 'osv-scanner',
    check: 'command -v osv-scanner',
    hint: 'brew install osv-scanner',
    stage: 'scans',
  },
  {
    name: 'opengrep',
    check: 'command -v opengrep',
    hint: 'see https://github.com/opengrep/opengrep#installation',
    stage: 'scans',
  },
  {
    name: 'cosign',
    check: 'command -v cosign',
    hint: 'brew install cosign',
    stage: 'scans',
  },
  {
    name: 'jscpd',
    check: 'pnpm exec jscpd --version',
    hint: 'cd trust-pipeline && pnpm install',
    stage: 'scans',
  },
  {
    name: 'tsarch',
    check: 'pnpm exec tsarch --version',
    hint: 'cd trust-pipeline && pnpm add -D tsarch',
    stage: 'scans',
  },
]

export type DoctorResult = { ok: boolean; missing: string[] }

/**
 * Checks every tool the pipeline can call, skipping tools whose stage is off.
 * Returns one install-hint line per missing tool.
 */
export async function doctor(
  cfg: ProjectConfig,
  available: (tool: Tool) => Promise<boolean> = async (tool) =>
    (await exec(tool.check)).ok,
): Promise<DoctorResult> {
  const missing: string[] = []
  for (const tool of TOOLS) {
    if (tool.stage && !cfg.stages[tool.stage]) continue
    if (!(await available(tool)))
      missing.push(`${tool.name} — install: ${tool.hint}`)
  }
  return { ok: missing.length === 0, missing }
}
