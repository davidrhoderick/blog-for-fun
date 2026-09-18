export const roles = ['administrator'] as const

export type Role = (typeof roles)[number]

export const permissions = [
  'posts:readUnpublished',
  'posts:create',
  'posts:update',
  'posts:delete',
  'postRevisions:read',
] as const

export type Permission = (typeof permissions)[number]

export type Principal = {
  id: string
  displayName: string
  email: string
  roles: Role[]
}

export type AuthSession = {
  id: string
  authUserId: string
  expiresAt: Date
  absoluteExpiresAt: Date
}
