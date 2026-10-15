import { exec } from '../exec'
import type { Stage } from './types'

export const scansStage: Stage = {
  name: 'scans',
  async run(cfg) {
    const outputs: string[] = []
    let ok = true
    for (const command of cfg.commands.scans) {
      const result = await exec(command, cfg.root)
      outputs.push(`$ ${command}\n${result.output}`)
      ok = ok && result.ok
    }
    return { name: 'scans', ok, output: outputs.join('\n') }
  },
}
