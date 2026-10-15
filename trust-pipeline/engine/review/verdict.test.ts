import { expect, test } from 'vitest'
import { HIGH_CONFIDENCE, verdict } from './verdict'

test('a high-confidence failure fails the verdict', { tags: ['unit'] }, () => {
  const result = verdict([
    { question: 'does one thing?', answer: 'pass', confidence: 1 },
    {
      question: 'meaningful assertions?',
      answer: 'fail',
      confidence: HIGH_CONFIDENCE,
    },
  ])

  expect(result.pass).toBe(false)
  expect(result.failures).toEqual([
    {
      question: 'meaningful assertions?',
      answer: 'fail',
      confidence: HIGH_CONFIDENCE,
    },
  ])
})

test('a low-confidence failure passes but is reported', {
  tags: ['unit'],
}, () => {
  const low = {
    question: 'does one thing?',
    answer: 'fail' as const,
    confidence: 0.5,
  }

  const result = verdict([low])

  expect(result.pass).toBe(true)
  expect(result.failures).toEqual([])
})

test('all passes pass', { tags: ['unit'] }, () => {
  const result = verdict([
    { question: 'a', answer: 'pass', confidence: 0.9 },
    { question: 'b', answer: 'pass', confidence: 0.4 },
  ])

  expect(result).toEqual({ pass: true, failures: [] })
})

test('an empty answer set passes', { tags: ['unit'] }, () => {
  expect(verdict([])).toEqual({ pass: true, failures: [] })
})
