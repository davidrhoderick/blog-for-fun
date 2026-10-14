import { expect, test } from 'vitest'
import { cn } from './index'

test('merges class names, later utilities winning', {
  tags: ['unit'],
}, () => {
  expect(cn('px-2 text-sm', 'px-4', ['font-semibold'])).toBe(
    'text-sm px-4 font-semibold',
  )
  expect(cn('hidden', undefined, null, false, { block: true })).toBe('block')
})
