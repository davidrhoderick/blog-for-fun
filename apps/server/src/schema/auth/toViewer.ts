import type { Principal, Role } from '../../auth/types'
import type { Viewer } from '../types.generated'

const toGraphQLRole = (role: Role) => {
  switch (role) {
    case 'administrator':
      return 'ADMINISTRATOR' as const
    default: {
      const unsupportedRole: never = role
      throw new Error(`Unsupported role: ${unsupportedRole}`)
    }
  }
}

export const toViewer = (principal: Principal): Viewer => ({
  id: principal.id,
  displayName: principal.displayName,
  email: principal.email,
  roles: principal.roles.map(toGraphQLRole),
})
