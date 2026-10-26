import { expect, test } from 'vitest'
import { decideStartup, skipsTrustPipeline, statusAfterVerify } from './startup'

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

test('the product-dev agent skips the trust pipeline', {
  tags: ['unit'],
}, () => {
  expect(skipsTrustPipeline({}, 'product-dev')).toBe(true)
})

test('the env opt-out skips the trust pipeline for any agent', {
  tags: ['unit'],
}, () => {
  expect(skipsTrustPipeline({ OPENCODE_PRODUCT_MODE: '1' }, 'build')).toBe(true)
})

test('a normal agent runs the trust pipeline', { tags: ['unit'] }, () => {
  expect(skipsTrustPipeline({}, 'build')).toBe(false)
})
