import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { config } from '../../project/config'
import { symbolsIn } from '../checks/ast'
import {
  batchSymbols,
  type Symbol as ChangedSymbol,
  collectDiff,
  collectSymbols,
  parseRubric,
  type Rubric,
  reviewStage,
  reviewSymbols,
} from './review'

// Never load a real .env: the missing-key test must not reach the network.
vi.mock('dotenv', () => ({ config: () => ({}) }))

const rubricPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../project/rubric.md',
)

const BEFORE = `export function greet(): string {
  return 'hi'
}

export function untouched(): number {
  return 1
}
`

let repo = ''

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'review-fixture-'))
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  }
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  writeFileSync(path.join(repo, 'sample.ts'), BEFORE)
  git('add', '.')
  git('commit', '-qm', 'base')
  writeFileSync(path.join(repo, 'sample.ts'), BEFORE.replace('hi', 'hello'))
  writeFileSync(path.join(repo, 'new.ts'), 'export const added = () => 1\n')
  process.chdir(repo)
})

afterAll(() => {
  process.chdir(path.resolve(repo, '..'))
  rmSync(repo, { recursive: true, force: true })
})

test('symbolsIn names functions, components, hooks, and methods', {
  tags: ['unit'],
}, () => {
  const source = [
    'export function plain() { return 1 }',
    'export const Card = () => null',
    'function useThing() { return 1 }',
    'class Box { open() { return 1 } }',
  ].join('\n')

  expect(symbolsIn(source, 'a.tsx').map((s) => [s.name, s.kind])).toEqual([
    ['plain', 'function'],
    ['Card', 'component'],
    ['useThing', 'hook'],
    ['open', 'method'],
  ])
})

test('the shipped rubric parses into pass/fail Choice items', {
  tags: ['integration'],
}, () => {
  const rubric = parseRubric(readFileSync(rubricPath, 'utf8'))
  const ids = rubric.items.map((item) => item.id).join(' ')

  expect(rubric.items.length).toBeGreaterThanOrEqual(4)
  expect(ids).toContain('structure')
  expect(ids).toContain('frontend')
  expect(ids).toContain('methodology')
  expect(ids).toContain('architecture')
  for (const item of rubric.items) {
    expect(item.options).toHaveLength(2)
    expect(item.question.length).toBeGreaterThan(0)
  }
})

test('collectSymbols keeps only the changed symbol, with before and after', {
  tags: ['integration'],
}, async () => {
  const symbols = collectSymbols(await collectDiff('HEAD'))

  expect(symbols.map((s) => s.name).sort()).toEqual(['added', 'greet'])
  const greet = symbols.find((s) => s.name === 'greet')
  expect(greet?.file).toBe('sample.ts')
  expect(greet?.kind).toBe('function')
  expect(greet?.before).toContain("return 'hi'")
  expect(greet?.after).toContain("return 'hello'")
})

test('collectDiff includes tracked changes and untracked files', {
  tags: ['integration'],
}, async () => {
  const diff = await collectDiff('HEAD')

  expect(diff).toContain('sample.ts')
  expect(diff).toContain('new.ts')
})

test('batchSymbols splits so each state stays under the budget', {
  tags: ['unit'],
}, () => {
  const rubric: Rubric = {
    items: [{ id: 'q', question: 'Q?', options: ['yes', 'no'] }],
  }
  const sized = (name: string, size: number): ChangedSymbol => ({
    file: 'a.ts',
    name,
    kind: 'function',
    before: '',
    after: 'x'.repeat(size),
  })

  expect(batchSymbols([sized('a', 10)], rubric)).toHaveLength(1)
  expect(
    batchSymbols([sized('a', 70_000), sized('b', 70_000)], rubric),
  ).toHaveLength(2)
  // A symbol larger than the budget still gets a batch of its own.
  expect(batchSymbols([sized('a', 200_000)], rubric)).toHaveLength(1)
})

test('reviewSymbols asks one Choice per rubric item per symbol', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      questions: Record<string, unknown>
    }
    const answers: Record<string, { choice: string; confidence: number }> = {}
    for (const id of Object.keys(body.questions)) {
      answers[id] = { choice: 'pass', confidence: 0.9 }
    }
    return { ok: true, json: async () => ({ answers }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  process.env.JEV_API_KEY = 'test-key'

  const rubric: Rubric = {
    items: [
      { id: 'one', question: 'Does it do one thing?', options: ['yes', 'no'] },
      { id: 'two', question: 'Is it tested?', options: ['yes', 'no'] },
    ],
  }
  const symbol: ChangedSymbol = {
    file: 'a.ts',
    name: 'greet',
    kind: 'function',
    before: 'old',
    after: 'new',
  }

  const reviewed = await reviewSymbols([symbol], rubric)

  expect(reviewed.get(symbol)).toEqual([
    { question: 'Does it do one thing?', answer: 'pass', confidence: 0.9 },
    { question: 'Is it tested?', answer: 'pass', confidence: 0.9 },
  ])

  const [url, init] = fetchMock.mock.calls[0] ?? []
  expect(url).toBe('https://api.typesafe.ai/v1/systemone')
  const body = JSON.parse(init?.body ?? '{}')
  expect(body.model).toBe('jev-1.13.0')
  expect(body.state.symbols[0]).toMatchObject({ symbol: 'greet', index: 0 })
  expect(Object.keys(body.questions)).toEqual(['0:one', '0:two'])
  expect(body.questions['0:one']).toEqual({
    type: 'choice',
    instructions: 'Review `symbols[0]`: Does it do one thing?',
    criteria: { pass: 'yes', fail: 'no' },
  })

  vi.unstubAllGlobals()
  delete process.env.JEV_API_KEY
})

test('the review stage skips and passes when the key is missing', {
  tags: ['unit'],
}, async () => {
  const saved = process.env.JEV_API_KEY
  delete process.env.JEV_API_KEY

  const result = await reviewStage.run(config)

  expect(result.ok).toBe(true)
  expect(result.output).toBe('review skipped: JEV_API_KEY not set')
  if (saved !== undefined) process.env.JEV_API_KEY = saved
})
