import { exec } from '../exec'
import type { Stage } from './types'

export const testStage: Stage = {
  name: 'test',
  async run(cfg) {
    const { ok, output } = await exec(cfg.commands.test, cfg.root)
    return { name: 'test', ok, output }
  },
}
