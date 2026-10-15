import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { config } from '../../project/config'
import { structureStage } from './structure'

const roots: string[] = []

function fixtureRoot(): string {
  const root = mkdtempSync(path.join('/tmp/opencode', 'structure-'))
  roots.push(root)
  return root
}

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

const longFunction = (lines: number): string =>
  `export function big() {\n${'  const x = 1\n'.repeat(lines - 2)}}\n`

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

test('fails the stage on a size violation in a nested file', {
  tags: ['integration'],
}, async () => {
  const root = fixtureRoot()
  write(root, 'src/deep/big.ts', longFunction(81))

  const result = await structureStage.run({ ...config, root })

  expect(result.ok).toBe(false)
  expect(result.output).toContain('src/deep/big.ts:1 function-length')
})

test('passes a clean tree and skips node_modules and non-source files', {
  tags: ['integration'],
}, async () => {
  const root = fixtureRoot()
  write(root, 'src/clean.tsx', 'export const App = () => <div />\n')
  write(root, 'node_modules/dep/big.ts', longFunction(200))
  write(root, 'README.md', 'x\n'.repeat(500))

  const result = await structureStage.run({ ...config, root })

  expect(result).toEqual({ name: 'structure', ok: true, output: '' })
})

test('ignores generated files', { tags: ['integration'] }, async () => {
  const root = fixtureRoot()
  write(root, 'apps/server/src/schema/post.generated.ts', longFunction(200))
  write(root, 'apps/admin/app/__generated__/post.ts', longFunction(200))

  const result = await structureStage.run({ ...config, root })

  expect(result.ok).toBe(true)
})
