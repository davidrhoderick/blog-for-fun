import { exec } from '../exec'
import { isPortOpen } from '../port'
import type { Stage } from './types'

export const typecheckStage: Stage = {
  name: 'typecheck',
  async run(cfg) {
    let output = ''
    if (await isPortOpen(cfg.devServerPort)) {
      output += `dev server on :${cfg.devServerPort}; codegen skipped\n`
    } else {
      const codegen = await exec(cfg.commands.codegen, cfg.root)
      output += `$ ${cfg.commands.codegen}\n${codegen.output}\n`
      if (!codegen.ok) return { name: 'typecheck', ok: false, output }
    }
    const typecheck = await exec(cfg.commands.typecheck, cfg.root)
    output += `$ ${cfg.commands.typecheck}\n${typecheck.output}\n`
    return { name: 'typecheck', ok: typecheck.ok, output }
  },
}
