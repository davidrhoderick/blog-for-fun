import { pathToFileURL } from 'node:url'
import { config } from '../project/config'
import { doctor } from './doctor'

/** Fast preflight only: is this machine able to run the pipeline at all? */
async function main(): Promise<void> {
  const result = await doctor(config)
  console.log(
    result.ok
      ? 'doctor: PASS'
      : `doctor: FAIL\n${result.missing.map((line) => `  ${line}`).join('\n')}`,
  )
  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
