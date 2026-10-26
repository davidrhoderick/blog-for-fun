import { expect, test } from 'vitest'
import { decideStartup, statusAfterVerify } from './startup'

test('an unchecked session triggers verification', { tags: ['unit'] }, () => {
  expect(decideStartup(undefined)).toEqual({ kind: 'verify' })
})

test('a ready session is admitted', { tags: ['unit'] }, () => {
  expect(decideStartup('ready')).toEqual({ kind: 'admit' })
})

test('a blocked session stays blocked', { tags: ['unit'] }, () => {
  expect(decideStartup('blocked')).toEqual({ kind: 'block' })
})

test('a passing verification unlocks the session', { tags: ['unit'] }, () => {
  expect(statusAfterVerify(true, 'ok')).toEqual({ status: 'ready' })
})

test('a failing verification blocks and remembers output', {
  tags: ['unit'],
}, () => {
  expect(statusAfterVerify(false, 'boom')).toEqual({
    status: 'blocked',
    output: 'boom',
  })
})
