import { expect, test } from 'vitest'
import {
  matchRetryAnswer,
  OTHER_INSTRUCTIONS,
  retryChoices,
  retryOptions,
} from './retry'

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

test('the offered choices pair each grant with the escape hatch last', {
  tags: ['unit'],
}, () => {
  expect(retryChoices(0)).toEqual([
    { label: 'Try again (3)', attempts: 3 },
    { label: 'Try again (2)', attempts: 2 },
    { label: 'Try again (1)', attempts: 1 },
    { label: OTHER_INSTRUCTIONS, attempts: null },
  ])
})

test('an answer is matched to the choice it names, ignoring surrounding space', {
  tags: ['unit'],
}, () => {
  const choices = retryChoices(1)
  expect(matchRetryAnswer(choices, '  Try again (2) ')?.attempts).toBe(2)
  expect(matchRetryAnswer(choices, OTHER_INSTRUCTIONS)?.attempts).toBeNull()
})

test('an answer that names no offered choice grants nothing', {
  tags: ['unit'],
}, () => {
  expect(matchRetryAnswer(retryChoices(0), 'Try again (99)')).toBeUndefined()
  expect(matchRetryAnswer(retryChoices(0), 'use 3 attempts')).toBeUndefined()
})
