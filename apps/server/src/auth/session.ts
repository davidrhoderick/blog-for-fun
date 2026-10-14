import { createHash, randomBytes } from 'node:crypto'
import { eq, lte, or } from 'drizzle-orm'
import { db } from '../db'
import {
  authPasswordCredentials,
  authSessions,
  authUserRoles,
  authUsers,
  users,
} from '../db/schema'
import type { AuthSession, Principal, Role } from './types'

const DAY = 24 * 60 * 60 * 1_000
export const SESSION_IDLE_DURATION_MS = 30 * DAY
export const SESSION_RENEWAL_WINDOW_MS = 15 * DAY
export const SESSION_ABSOLUTE_DURATION_MS = 90 * DAY

export const hashSessionToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

export const createSession = async (authUserId: string, now = new Date()) => {
  const token = randomBytes(32).toString('base64url')
  const session: AuthSession = {
    id: hashSessionToken(token),
    authUserId,
    expiresAt: new Date(now.getTime() + SESSION_IDLE_DURATION_MS),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_DURATION_MS),
  }

  await db.insert(authSessions).values({
    ...session,
    createdAt: now,
    lastSeenAt: now,
  })

  return { token, session }
}

export type SessionValidationResult = {
  session: AuthSession | null
  principal: Principal | null
  renewed: boolean
}

const invalidSession = (): SessionValidationResult => ({
  session: null,
  principal: null,
  renewed: false,
})

export const validateSessionToken = async (
  token: string,
  now = new Date(),
): Promise<SessionValidationResult> => {
  const sessionId = hashSessionToken(token)
  const [row] = await db
    .select({
      id: authSessions.id,
      authUserId: authSessions.authUserId,
      expiresAt: authSessions.expiresAt,
      absoluteExpiresAt: authSessions.absoluteExpiresAt,
      status: authUsers.status,
      displayName: users.displayName,
      email: authPasswordCredentials.email,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authSessions.authUserId, authUsers.id))
    .innerJoin(users, eq(authUsers.id, users.id))
    .innerJoin(
      authPasswordCredentials,
      eq(authUsers.id, authPasswordCredentials.authUserId),
    )
    .where(eq(authSessions.id, sessionId))
    .limit(1)

  if (!row) {
    return invalidSession()
  }

  if (
    row.status !== 'active' ||
    row.expiresAt <= now ||
    row.absoluteExpiresAt <= now
  ) {
    await db.delete(authSessions).where(eq(authSessions.id, sessionId))
    return invalidSession()
  }

  const assignedRoles = await db
    .select({ role: authUserRoles.role })
    .from(authUserRoles)
    .where(eq(authUserRoles.authUserId, row.authUserId))

  let expiresAt = row.expiresAt
  let renewed = false
  if (row.expiresAt.getTime() - now.getTime() <= SESSION_RENEWAL_WINDOW_MS) {
    expiresAt = new Date(
      Math.min(
        now.getTime() + SESSION_IDLE_DURATION_MS,
        row.absoluteExpiresAt.getTime(),
      ),
    )
    renewed = true
    await db
      .update(authSessions)
      .set({ expiresAt, lastSeenAt: now })
      .where(eq(authSessions.id, sessionId))
  }

  return {
    session: {
      id: row.id,
      authUserId: row.authUserId,
      expiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
    },
    principal: {
      id: row.authUserId,
      displayName: row.displayName,
      email: row.email,
      roles: assignedRoles.map(({ role }) => role as Role),
    },
    renewed,
  }
}

export const revokeSession = async (sessionId: string) => {
  await db.delete(authSessions).where(eq(authSessions.id, sessionId))
}

export const revokeUserSessions = async (authUserId: string) => {
  await db.delete(authSessions).where(eq(authSessions.authUserId, authUserId))
}

export const deleteExpiredSessions = async (now = new Date()) => {
  await db
    .delete(authSessions)
    .where(
      or(
        lte(authSessions.expiresAt, now),
        lte(authSessions.absoluteExpiresAt, now),
      ),
    )
}
