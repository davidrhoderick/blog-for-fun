import { exec } from '../exec'
import type { Stage } from './types'

export const typecheckStage: Stage = {
  name: 'typecheck',
  async run(cfg) {
    let output = ''
    // The server's dev watcher only regenerates the GraphQL schema; the app
    // codegen (Relay + router types) still needs to run, so always run it all.
    const codegenResult = await exec(cfg.commands.codegen, cfg.root)
    output += `$ ${cfg.commands.codegen}\n${codegenResult.output}\n`
    if (!codegenResult.ok) return { name: 'typecheck', ok: false, output }
    const typecheck = await exec(cfg.commands.typecheck, cfg.root)
    output += `$ ${cfg.commands.typecheck}\n${typecheck.output}\n`
    return { name: 'typecheck', ok: typecheck.ok, output }
  },
}
