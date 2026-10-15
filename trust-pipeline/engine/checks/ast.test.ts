import { expect, test } from 'vitest'
import {
  checkSource,
  MAX_FILE_LINES,
  MAX_FUNCTION_LINES,
  MAX_NESTING,
} from './ast'

/** A function whose line span is exactly `lines`. */
const functionOfLines = (lines: number): string =>
  `function big() {\n${'  const x = 1\n'.repeat(lines - 2)}}\n`

/** `depth` nested `if` statements inside one function. */
const nestedIfs = (depth: number): string =>
  [
    'function deep() {',
    ...Array.from(
      { length: depth },
      (_, i) => `${'  '.repeat(i + 1)}if (a${i}) {`,
    ),
    `${'  '.repeat(depth + 1)}return 1`,
    ...Array.from({ length: depth }, (_, i) => `${'  '.repeat(depth - i)}}`),
    '}',
  ].join('\n')

test('flags a function longer than the limit', { tags: ['unit'] }, () => {
  const over = checkSource({
    filePath: 'a.ts',
    source: functionOfLines(MAX_FUNCTION_LINES + 1),
  })

  expect(over).toHaveLength(1)
  expect(over[0]?.rule).toBe('function-length')
  expect(over[0]?.file).toBe('a.ts')
  expect(over[0]?.line).toBe(1)
  expect(over[0]?.message).toContain(String(MAX_FUNCTION_LINES + 1))
})

test('passes a function at exactly the limit', { tags: ['unit'] }, () => {
  const atLimit = checkSource({
    filePath: 'a.ts',
    source: functionOfLines(MAX_FUNCTION_LINES),
  })

  expect(atLimit).toEqual([])
})

test('flags a file longer than the limit', { tags: ['unit'] }, () => {
  const source = Array.from(
    { length: MAX_FILE_LINES + 1 },
    (_, i) => `const v${i} = ${i}`,
  ).join('\n')

  const over = checkSource({ filePath: 'a.ts', source })

  expect(over.map((v) => v.rule)).toEqual(['file-length'])
  expect(over[0]?.line).toBe(1)
})

test('flags nesting deeper than the limit', { tags: ['unit'] }, () => {
  const over = checkSource({
    filePath: 'a.ts',
    source: nestedIfs(MAX_NESTING + 1),
  })

  expect(over).toHaveLength(1)
  expect(over[0]?.rule).toBe('nesting')
  expect(over[0]?.message).toContain(String(MAX_NESTING + 1))
})

test('passes nesting at exactly the limit', { tags: ['unit'] }, () => {
  const atLimit = checkSource({
    filePath: 'a.ts',
    source: nestedIfs(MAX_NESTING),
  })

  expect(atLimit).toEqual([])
})

test('passes a compliant multi-line-signature function', {
  tags: ['unit'],
}, () => {
  const source = [
    'function multi(',
    '  a: number,',
    '  b: number,',
    '  c: number,',
    '  d: number,',
    ') {',
    '  return a + b + c + d',
    '}',
  ].join('\n')

  expect(checkSource({ filePath: 'a.ts', source })).toEqual([])
})

test('ignores generated files', { tags: ['unit'] }, () => {
  const source = functionOfLines(MAX_FUNCTION_LINES + 5)

  expect(
    checkSource({
      filePath: 'apps/server/src/schema/post.generated.ts',
      source,
    }),
  ).toEqual([])
  expect(
    checkSource({
      filePath: 'apps/admin/app/__generated__/post.ts',
      source,
    }),
  ).toEqual([])
})
