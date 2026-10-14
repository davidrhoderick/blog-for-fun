import { exec } from '../exec'
import type { Stage } from './types'

export const auditStage: Stage = {
  name: 'audit',
  async run(cfg) {
    const { ok, output } = await exec(cfg.commands.audit, cfg.root)
    return { name: 'audit', ok, output }
  },
}
