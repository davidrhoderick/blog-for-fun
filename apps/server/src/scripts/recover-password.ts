import { confirm, input, password } from '@inquirer/prompts'
import { recoverAdministratorPassword } from '../auth/account'
import { env } from '../lib/env'

if (!process.stdin.isTTY)
  throw new Error('Password recovery must run interactively')

const target = new URL(env.tursoConnectionUrl)
const location =
  target.protocol === 'file:'
    ? env.tursoConnectionUrl
    : `${target.protocol}//${target.host}${target.pathname}`
console.info(`Database: ${location}`)
const proceed = await confirm({
  message: 'Rewrite the administrator password in this database?',
  default: false,
})
if (!proceed) {
  console.info('No changes made')
  process.exit(0)
}

const email = await input({ message: 'Administrator email:' })
const newPassword = await password({ message: 'New password:', mask: '*' })
const confirmation = await password({
  message: 'Confirm password:',
  mask: '*',
})
if (newPassword !== confirmation) throw new Error('Passwords do not match')

const authUserId = await recoverAdministratorPassword(email, newPassword)
console.info(`Recovered password for ${email} (${authUserId})`)
console.info('All existing sessions for that account were revoked.')
