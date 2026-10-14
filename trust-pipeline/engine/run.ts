import { pathToFileURL } from 'node:url'
import { config } from '../project/config'
import type { ProjectConfig } from './config'
import { type DoctorResult, doctor } from './doctor'
import { auditStage } from './stages/audit'
import { lintStage } from './stages/lint'
import { testStage } from './stages/test'
import { typecheckStage } from './stages/typecheck'
import type { Stage, StageResult } from './stages/types'

export async function runPipeline(
  stages: Stage[],
  cfg: ProjectConfig,
  preflight: (cfg: ProjectConfig) => Promise<DoctorResult> = doctor,
): Promise<{ ok: boolean; results: StageResult[] }> {
  const check = await preflight(cfg)
  if (!check.ok) {
    return {
      ok: false,
      results: [
        {
          name: 'doctor',
          ok: false,
          output: `missing tools:\n${check.missing.map((m) => `  ${m}`).join('\n')}`,
        },
      ],
    }
  }

  const results: StageResult[] = []
  for (const stage of stages) {
    const result = await stage.run(cfg)
    results.push(result)
    if (!result.ok) return { ok: false, results }
  }
  return { ok: true, results }
}

const ALL_STAGES: Stage[] = [auditStage, lintStage, typecheckStage, testStage]

export function enabledStages(cfg: ProjectConfig): Stage[] {
  return ALL_STAGES.filter(
    (stage) => cfg.stages[stage.name as keyof ProjectConfig['stages']],
  )
}

async function main(): Promise<void> {
  const result = await runPipeline(enabledStages(config), config)
  for (const stage of result.results) {
    console.log(
      `\n── ${stage.name}: ${stage.ok ? 'PASS' : 'FAIL'} ──\n${stage.output}`,
    )
  }
  console.log(`\nverify: ${result.ok ? 'PASS' : 'FAIL'}`)
  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
