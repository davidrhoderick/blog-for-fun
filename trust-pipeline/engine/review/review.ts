import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { symbolsIn } from '../checks/ast'
import { exec } from '../exec'
import type { Stage, StageResult } from '../stages/types'
import { type RubricAnswer, verdict } from './verdict'

/** The pipeline's own `.env`, beside its package, whatever the cwd is. */
const ENV = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.env',
)
const RUBRIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../project/rubric.md',
)

const MODEL = 'jev-1.13.0'
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
/** The committed diff base in CI; locally, review the working tree against HEAD. */
export const reviewBaseRef = (env: NodeJS.ProcessEnv = process.env): string =>
  env.VERIFY_BASE_REF || 'HEAD'
/** Jev 1.13: 32k tokens for `state` plus the longest question. */
export const STATE_BUDGET = 32_000
const CHARS_PER_TOKEN = 4

export type Symbol = {
  file: string
  name: string
  kind: string
  before: string
  after: string
}

export type RubricItem = {
  id: string
  question: string
  options: [string, string]
  /** `diff` asks once against the whole diff; default asks of each changed symbol. */
  scope?: 'symbol' | 'diff'
}

export type Rubric = { items: RubricItem[] }

type FileDiff = { file: string; ranges: [number, number][] }

/** New-file line ranges touched by each changed file in a unified diff. */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = []
  let current: FileDiff | undefined
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim()
      current =
        target === '/dev/null'
          ? undefined
          : { file: target.replace(/^b\//, ''), ranges: [] }
      if (current) files.push(current)
      continue
    }
    if (!current || !line.startsWith('@@ ')) continue
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!header) continue
    const start = Number(header[1])
    const count = header[2] === undefined ? 1 : Number(header[2])
    // A pure deletion has no new lines; anchor on the line it was removed from.
    current.ranges.push([start, count === 0 ? start : start + count - 1])
  }
  return files
}

function repoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim()
}

function readSource(
  root: string,
  file: string,
  ref?: string,
): string | undefined {
  try {
    return ref
      ? execFileSync('git', ['show', `${ref}:${file}`], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
      : readFileSync(path.join(root, file), 'utf8')
  } catch {
    return undefined
  }
}

/** The task base: working tree vs `ref`, plus untracked files (read-only). */
export async function collectDiff(ref = 'HEAD'): Promise<string> {
  const root = (
    await exec('git rev-parse --show-toplevel', process.cwd())
  ).output.trim()
  // Force a/ b/ prefixes (diff.mnemonicPrefix changes them) and no context
  // lines, so each hunk marks exactly the lines that changed.
  const prefixes = '--src-prefix=a/ --dst-prefix=b/ -U0'
  const parts = [
    (await exec(`git diff ${prefixes} ${sh(ref)}`, root)).output.trim(),
  ]
  const untracked = (
    await exec('git ls-files --others --exclude-standard', root)
  ).output
    .split('\n')
    .filter(Boolean)
  for (const file of untracked) {
    // --no-index exits 1 on differences; the patch is still the output.
    parts.push(
      (
        await exec(
          `git diff --no-index ${prefixes} -- /dev/null ${sh(file)}`,
          root,
        )
      ).output.trim(),
    )
  }
  return parts.filter(Boolean).join('\n')
}

const sh = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

/** Changed symbols: whole-file AST declarations whose lines the diff touches. */
export function collectSymbols(diff: string, ref = 'HEAD'): Symbol[] {
  const root = repoRoot()
  const symbols: Symbol[] = []
  for (const { file, ranges } of parseDiff(diff)) {
    if (ranges.length === 0) continue
    const after = readSource(root, file)
    if (after === undefined) continue
    const before = new Map(
      symbolsIn(readSource(root, file, ref) ?? '', file).map((s) => [
        s.name,
        s,
      ]),
    )
    for (const symbol of symbolsIn(after, file)) {
      if (!ranges.some(([a, b]) => symbol.start <= b && symbol.end >= a))
        continue
      symbols.push({
        file,
        name: symbol.name,
        kind: symbol.kind,
        before: before.get(symbol.name)?.text ?? '',
        after: symbol.text,
      })
    }
  }
  return symbols
}

/** Parses the `## <id>` sections of `project/rubric.md`. */
export function parseRubric(markdown: string): Rubric {
  const items: Rubric['items'] = []
  for (const section of markdown.split(/^## /m).slice(1)) {
    const [id = '', ...lines] = section.split('\n')
    const field = (name: string): string =>
      lines
        .find((line) => line.startsWith(`${name}:`))
        ?.slice(name.length + 1)
        .trim() ?? ''
    const question = field('question')
    const pass = field('pass')
    const fail = field('fail')
    if (id.trim() && question && pass && fail) {
      items.push({
        id: id.trim(),
        question,
        options: [pass, fail],
        scope: field('scope') === 'diff' ? 'diff' : 'symbol',
      })
    }
  }
  return { items }
}

/** Questions asked of each changed symbol (everything not scoped to the diff). */
const symbolItems = (rubric: Rubric): RubricItem[] =>
  rubric.items.filter((item) => item.scope !== 'diff')

/** Greedy batches that keep each `state` inside the Jev budget. */
export function batchSymbols(symbols: Symbol[], rubric: Rubric): Symbol[][] {
  const longest = Math.max(
    0,
    ...symbolItems(rubric).map(
      (item) => item.question.length + item.options.join('').length,
    ),
  )
  const budget =
    (STATE_BUDGET - Math.ceil(longest / CHARS_PER_TOKEN)) * CHARS_PER_TOKEN
  const batches: Symbol[][] = []
  let batch: Symbol[] = []
  let size = 0
  for (const symbol of symbols) {
    const cost = JSON.stringify(symbol).length + 1
    if (batch.length > 0 && size + cost > budget) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(symbol)
    size += cost
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

type ChoiceAnswer = { choice: string; confidence: number }

/** A missing or unexpected answer is treated as an uncertain failure. */
const toAnswer = (
  item: RubricItem,
  answer: ChoiceAnswer | undefined,
): RubricAnswer => ({
  question: item.question,
  answer: answer?.choice === 'pass' ? 'pass' : 'fail',
  confidence: answer?.confidence ?? 0,
})

// shortcut: no retry/backoff (the official SDK has one); add it if 429/529
// responses start flaking the pipeline.
async function askJev(
  state: unknown,
  questions: Record<string, unknown>,
  key: string,
): Promise<Record<string, ChoiceAnswer>> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state, model: MODEL, questions }),
  })
  if (!response.ok)
    throw new Error(`Jev ${response.status}: ${await response.text()}`)
  const body = (await response.json()) as {
    answers: Record<string, ChoiceAnswer>
  }
  return body.answers
}

/**
 * One Choice question per rubric item per symbol, all asked in parallel against
 * a batched `state`; code owns the loop and combines the answers.
 */
export async function reviewSymbols(
  symbols: Symbol[],
  rubric: Rubric,
): Promise<Map<Symbol, RubricAnswer[]>> {
  const key = process.env.JEV_API_KEY
  if (!key) throw new Error('JEV_API_KEY not set')
  const items = symbolItems(rubric)
  const reviewed = new Map<Symbol, RubricAnswer[]>(
    symbols.map((symbol) => [symbol, []]),
  )
  for (const batch of batchSymbols(symbols, rubric)) {
    const state = {
      symbols: batch.map((symbol, index) => ({
        index,
        file: symbol.file,
        symbol: symbol.name,
        kind: symbol.kind,
        before: symbol.before,
        after: symbol.after,
      })),
    }
    const questions: Record<string, unknown> = {}
    batch.forEach((_, index) => {
      for (const item of items) {
        questions[`${index}:${item.id}`] = {
          type: 'choice',
          instructions: `Review \`symbols[${index}]\`: ${item.question}`,
          criteria: { pass: item.options[0], fail: item.options[1] },
        }
      }
    })
    const answers = await askJev(state, questions, key)
    batch.forEach((symbol, index) => {
      const list = reviewed.get(symbol)
      if (!list) return
      for (const item of items) {
        list.push(toAnswer(item, answers[`${index}:${item.id}`]))
      }
    })
  }
  return reviewed
}

/**
 * Diff-level questions: the whole collected diff as `state`, asked once.
 * shortcut: one request holds the whole diff; chunk it if a task diff ever
 * exceeds the 32k state budget.
 */
export async function reviewDiff(
  diff: string,
  rubric: Rubric,
): Promise<RubricAnswer[]> {
  const items = rubric.items.filter((item) => item.scope === 'diff')
  if (items.length === 0) return []
  const key = process.env.JEV_API_KEY
  if (!key) throw new Error('JEV_API_KEY not set')
  const questions: Record<string, unknown> = {}
  for (const item of items) {
    questions[item.id] = {
      type: 'choice',
      instructions: item.question,
      criteria: { pass: item.options[0], fail: item.options[1] },
    }
  }
  const answers = await askJev(diff, questions, key)
  return items.map((item) => toAnswer(item, answers[item.id]))
}

export const reviewStage: Stage = {
  name: 'review',
  async run() {
    loadEnv({ path: ENV, quiet: true })
    if (!process.env.JEV_API_KEY) {
      // Defensive: the doctor already requires the key when review is enabled.
      return {
        name: 'review',
        ok: false,
        output:
          'review failed: JEV_API_KEY not set (add it to trust-pipeline/.env)',
      }
    }
    try {
      return await runReview()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { name: 'review', ok: false, output: `review failed: ${message}` }
    }
  },
}

async function runReview(): Promise<StageResult> {
  const baseRef = reviewBaseRef()
  const diff = await collectDiff(baseRef)
  if (!diff.trim()) return { name: 'review', ok: true, output: 'no changes' }
  const rubric = parseRubric(readFileSync(RUBRIC, 'utf8'))
  const symbols = collectSymbols(diff, baseRef)
  if (symbols.length === 0)
    return { name: 'review', ok: true, output: 'no changed symbols' }
  const reviewed = await reviewSymbols(symbols, rubric)
  const entries: { label: string; answer: RubricAnswer }[] = []
  for (const [symbol, answers] of reviewed) {
    for (const answer of answers) {
      entries.push({ label: `${symbol.file}:${symbol.name}`, answer })
    }
  }
  for (const answer of await reviewDiff(diff, rubric)) {
    entries.push({ label: 'diff', answer })
  }
  const lines = entries.map(
    ({ label, answer }) =>
      `${label} — ${answer.question}: ${answer.answer} (${answer.confidence.toFixed(2)})`,
  )
  const result = verdict(entries.map((entry) => entry.answer))
  const uncertain = entries.filter(
    ({ answer }) =>
      answer.answer === 'fail' && !result.failures.includes(answer),
  )
  if (uncertain.length > 0) {
    lines.push(
      `uncertain (escalate): ${uncertain
        .map(({ label, answer }) => `${label} — ${answer.question}`)
        .join('; ')}`,
    )
  }
  lines.push(
    `verdict: ${result.pass ? 'PASS' : 'FAIL'} (judgment-based, not deterministic)`,
  )
  return { name: 'review', ok: result.pass, output: lines.join('\n') }
}
