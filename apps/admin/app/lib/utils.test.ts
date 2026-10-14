import { expect, test } from 'vitest'
import { cn } from './utils'

test('merges conflicting Tailwind utilities', { tags: ['unit'] }, () => {
  expect(cn('p-2 text-sm', 'p-4')).toBe('text-sm p-4')
  expect(cn('flex', false && 'hidden', undefined)).toBe('flex')
})
