import { expect, test } from 'vitest'
import {
  decideStartup,
  skipsTrustPipeline,
  startupBanner,
  statusAfterDoctor,
} from './startup'

test('an unchecked session runs the doctor', { tags: ['unit'] }, () => {
  expect(decideStartup(undefined)).toEqual({ kind: 'doctor' })
})

test('a ready session is admitted without rechecking', {
  tags: ['unit'],
}, () => {
  expect(decideStartup('ready')).toEqual({ kind: 'admit' })
})

test('a blocked session is not rechecked on every prompt', {
  tags: ['unit'],
}, () => {
  expect(decideStartup('blocked')).toEqual({ kind: 'blocked' })
})

test('a passing doctor unlocks the session', { tags: ['unit'] }, () => {
  expect(statusAfterDoctor(true, 'ok')).toEqual({ status: 'ready' })
})

test('a failing doctor blocks and remembers its output', {
  tags: ['unit'],
}, () => {
  expect(statusAfterDoctor(false, 'missing JEV_API_KEY')).toEqual({
    status: 'blocked',
    output: 'missing JEV_API_KEY',
  })
})

test('the banner names the failure and the repair command', {
  tags: ['unit'],
}, () => {
  const banner = startupBanner('JEV_API_KEY — install: add it')
  expect(banner).toContain('STARTUP CHECK FAILED')
  expect(banner).toContain('/pipeline-repair')
  expect(banner).toContain('JEV_API_KEY')
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
