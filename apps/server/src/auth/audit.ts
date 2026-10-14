import { db } from '../db'
import { authAuditEvents } from '../db/schema'

type AuditEvent = {
  eventType: string
  actorAuthUserId?: string | null
  subjectAuthUserId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export const recordAuditEvent = async (event: AuditEvent) => {
  await db.insert(authAuditEvents).values({
    eventType: event.eventType,
    actorAuthUserId: event.actorAuthUserId,
    subjectAuthUserId: event.subjectAuthUserId,
    metadata: event.metadata ?? {},
  })
}
