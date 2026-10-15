import { expect, test } from 'vitest'
import { retryOptions } from './retry'

test('offers 3/2/1 grants before any budget is spent', {
  tags: ['unit'],
}, () => {
  expect(retryOptions(0)).toEqual([3, 2, 1])
})

test('drops the top grant once one budget is spent', {
  tags: ['unit'],
}, () => {
  expect(retryOptions(1)).toEqual([2, 1])
})

test('offers only the single-attempt grant after two budgets', {
  tags: ['unit'],
}, () => {
  expect(retryOptions(2)).toEqual([1])
})

test('never drops below one attempt however many budgets are spent', {
  tags: ['unit'],
}, () => {
  expect(retryOptions(5)).toEqual([1])
})
