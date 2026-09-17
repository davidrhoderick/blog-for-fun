import { input, password } from '@inquirer/prompts'
import { bootstrapAdministrator } from '../auth/account'

const email =
  process.env.BOOTSTRAP_EMAIL ??
  (await input({ message: 'Administrator email:' }))
const displayName =
  process.env.BOOTSTRAP_DISPLAY_NAME ??
  (await input({ message: 'Display name:' }))
const administratorPassword =
  process.env.BOOTSTRAP_PASSWORD ??
  (await password({ message: 'Password:', mask: '*' }))

const authUserId = await bootstrapAdministrator({
  email,
  displayName,
  password: administratorPassword,
})

console.info(`Bootstrapped administrator ${authUserId}`)
