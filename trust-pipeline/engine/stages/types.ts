import type { ProjectConfig } from '../config'

export type StageResult = { name: string; ok: boolean; output: string }

export type Stage = {
  name: string
  run(cfg: ProjectConfig): Promise<StageResult>
}
