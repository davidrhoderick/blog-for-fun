import { GraphQLError } from 'graphql'
import type { AuthContext } from './context'
import type { Permission, Role } from './types'

const permissionsByRole: Record<Role, ReadonlySet<Permission>> = {
  administrator: new Set([
    'posts:create',
    'posts:update',
    'posts:delete',
    'postRevisions:read',
  ]),
}

export const hasPermission = (roles: readonly Role[], permission: Permission) =>
  roles.some((role) => permissionsByRole[role].has(permission))

export const requireAuthenticatedUser = (context: AuthContext) => {
  if (!context.principal) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    })
  }

  return context.principal
}

export const requirePermission = (
  context: AuthContext,
  permission: Permission,
) => {
  const principal = requireAuthenticatedUser(context)
  if (!hasPermission(principal.roles, permission)) {
    throw new GraphQLError('Permission denied', {
      extensions: { code: 'FORBIDDEN' },
    })
  }

  return principal
}
