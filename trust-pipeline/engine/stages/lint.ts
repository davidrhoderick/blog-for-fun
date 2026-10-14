import { exec } from '../exec'
import type { Stage } from './types'

export const lintStage: Stage = {
  name: 'lint',
  async run(cfg) {
    const { ok, output } = await exec(cfg.commands.lint, cfg.root)
    return { name: 'lint', ok, output }
  },
}
