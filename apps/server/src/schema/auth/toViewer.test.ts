import { expect, test } from 'vitest'
import { type Role, roles } from '../../auth/types'
import { toViewer } from './toViewer'

const principal = {
  id: 'user-1',
  displayName: 'Blog Administrator',
  email: 'admin@example.com',
  roles: [...roles],
}

test('maps a principal and its roles onto the viewer type', {
  tags: ['integration'],
}, () => {
  expect(toViewer(principal)).toEqual({
    id: 'user-1',
    displayName: 'Blog Administrator',
    email: 'admin@example.com',
    roles: ['ADMINISTRATOR'],
  })
})

test('rejects a role the API cannot represent', { tags: ['unit'] }, () => {
  expect(() => toViewer({ ...principal, roles: ['ghost' as Role] })).toThrow(
    'Unsupported role: ghost',
  )
})
