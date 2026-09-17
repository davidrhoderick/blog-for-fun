import { count, eq } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../db'
import {
  authAuditEvents,
  authPasswordCredentials,
  authUserRoles,
  authUsers,
  users,
} from '../db/schema'
import { normalizeEmail, validateEmail } from './email'
import {
  acquirePasswordCheck,
  assertLoginAllowed,
  clearLoginAttempts,
  recordLoginFailure,
} from './login-rate-limit'
import { hashPassword, verifyPassword } from './password'
import { createSession } from './session'

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$mQ20sIhbYmtaKcl5T2HCiA$pdhBK9B2nDN2+jzS2cG4PCNW+3J2nz8hEwLNcHCTxbA'

const invalidCredentials = () =>
  new GraphQLError('Invalid email or password', {
    extensions: { code: 'UNAUTHENTICATED' },
  })

export const authenticatePassword = async (email: string, password: string) => {
  const normalizedEmail = normalizeEmail(email)
  assertLoginAllowed(normalizedEmail)
  const [credential] = await db
    .select({
      authUserId: authPasswordCredentials.authUserId,
      passwordHash: authPasswordCredentials.passwordHash,
      status: authUsers.status,
    })
    .from(authPasswordCredentials)
    .innerJoin(authUsers, eq(authPasswordCredentials.authUserId, authUsers.id))
    .where(eq(authPasswordCredentials.email, normalizedEmail))
    .limit(1)

  const releasePasswordCheck = acquirePasswordCheck()
  let passwordMatches: boolean
  try {
    passwordMatches = await verifyPassword(
      credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    )
  } finally {
    releasePasswordCheck()
  }

  if (!credential || !passwordMatches || credential.status !== 'active') {
    recordLoginFailure(normalizedEmail)
    throw invalidCredentials()
  }

  clearLoginAttempts(normalizedEmail)
  const session = await createSession(credential.authUserId)
  return { authUserId: credential.authUserId, ...session }
}

type BootstrapAdministratorInput = {
  email: string
  displayName: string
  password: string
}

export const bootstrapAdministrator = async (
  input: BootstrapAdministratorInput,
) => {
  const email = validateEmail(input.email)
  const displayName = input.displayName.trim()
  if (!displayName) {
    throw new Error('Display name is required')
  }

  const passwordHash = await hashPassword(input.password)
  const authUserId = crypto.randomUUID()

  await db.transaction(async (tx) => {
    const [result] = await tx.select({ value: count() }).from(authUsers)
    if (result.value !== 0) {
      throw new Error(
        'Bootstrap refused because an authentication user already exists',
      )
    }

    await tx.insert(authUsers).values({ id: authUserId })
    await tx.insert(users).values({ id: authUserId, displayName })
    await tx.insert(authPasswordCredentials).values({
      authUserId,
      email,
      passwordHash,
    })
    await tx.insert(authUserRoles).values({
      authUserId,
      role: 'administrator',
    })
    await tx.insert(authAuditEvents).values({
      actorAuthUserId: authUserId,
      subjectAuthUserId: authUserId,
      eventType: 'administrator.bootstrapped',
      metadata: {},
    })
  })

  return authUserId
}
