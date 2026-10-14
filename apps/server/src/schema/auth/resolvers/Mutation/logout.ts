import { recordAuditEvent } from '../../../../auth/audit'
import { createBlankSessionCookie } from '../../../../auth/cookie'
import { revokeSession } from '../../../../auth/session'
import type { MutationResolvers } from './../../../types.generated'

export const logout: NonNullable<MutationResolvers['logout']> = async (
  _parent,
  _args,
  context,
) => {
  if (context.session) {
    await revokeSession(context.session.id)
    context.responseHeaders.set('set-cookie', createBlankSessionCookie())
    await recordAuditEvent({
      eventType: 'session.revoked',
      actorAuthUserId: context.session.authUserId,
      subjectAuthUserId: context.session.authUserId,
    })
  }

  context.responseHeaders.set('set-cookie', createBlankSessionCookie())
  return true
}
