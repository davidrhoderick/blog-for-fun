import { exec } from '../exec'
import { isPortOpen } from '../port'
import type { Stage } from './types'

export const typecheckStage: Stage = {
  name: 'typecheck',
  async run(cfg) {
    let output = ''
    // The server's dev watcher only regenerates the GraphQL schema, so the app
    // codegen (Relay + router types) still runs while the port is up.
    const codegen = (await isPortOpen(cfg.devServerPort))
      ? cfg.commands.codegenApps
      : cfg.commands.codegen
    const codegenResult = await exec(codegen, cfg.root)
    output += `$ ${codegen}\n${codegenResult.output}\n`
    if (!codegenResult.ok) return { name: 'typecheck', ok: false, output }
    const typecheck = await exec(cfg.commands.typecheck, cfg.root)
    output += `$ ${cfg.commands.typecheck}\n${typecheck.output}\n`
    return { name: 'typecheck', ok: typecheck.ok, output }
  },
}
