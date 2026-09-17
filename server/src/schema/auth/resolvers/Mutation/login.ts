import { authenticatePassword, recordAuditEvent } from '../../../../auth'
import { createSessionCookie } from '../../../../auth/cookie'
import { revokeSession, validateSessionToken } from '../../../../auth/session'
import type { MutationResolvers } from './../../../types.generated'
import { toViewer } from '../../toViewer'

export const login: NonNullable<MutationResolvers['login']> = async (
  _parent,
  { input },
  context,
) => {
  const { authUserId, token, session } = await authenticatePassword(
    input.email,
    input.password,
  )
  const { principal } = await validateSessionToken(token)
  if (!principal) {
    await revokeSession(session.id)
    throw new Error('Created session could not be validated')
  }

  try {
    await recordAuditEvent({
      eventType: 'session.created',
      actorAuthUserId: authUserId,
      subjectAuthUserId: authUserId,
    })
  } catch (error) {
    await revokeSession(session.id)
    throw error
  }

  context.responseHeaders.set('set-cookie', createSessionCookie(token, session))
  return toViewer(principal)
}
