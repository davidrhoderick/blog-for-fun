import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test } from 'vitest'
import { exec } from '../exec'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const plugin = path.join(repoRoot, 'biome/plugins/no-jsx-in-memo.grit')
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

// A temp project whose plugin `includes` and fixture path mirror biome.json's.
function fixture(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'grit-'))
  roots.push(root)
  writeFileSync(
    path.join(root, 'biome.json'),
    JSON.stringify({
      vcs: { enabled: false },
      formatter: { enabled: false },
      plugins: [
        { path: plugin, includes: ['**/apps/admin/**', '**/apps/blog/**'] },
      ],
    }),
  )
  const file = path.join(root, 'apps/admin/thing.tsx')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, source)
  return root
}

function check(root: string) {
  const file = path.join(root, 'apps/admin/thing.tsx')
  return exec(
    `pnpm exec biome check --config-path "${root}" "${file}"`,
    repoRoot,
  )
}

const MESSAGE = 'Do not build JSX inside useMemo/useCallback'

test('flags JSX returned from useMemo', { tags: ['integration'] }, async () => {
  const bad = 'export const x = useMemo(() => <div />, [])\n'

  const result = await check(fixture(bad))

  expect(result.ok).toBe(false)
  expect(result.output).toContain(MESSAGE)
})

test('flags JSX returned from useCallback', {
  tags: ['integration'],
}, async () => {
  const bad = 'export const x = useCallback(() => <span>hi</span>, [])\n'

  const result = await check(fixture(bad))

  expect(result.ok).toBe(false)
  expect(result.output).toContain(MESSAGE)
})

test('passes a hook that returns a value', {
  tags: ['integration'],
}, async () => {
  const clean = 'export const x = useMemo(() => 1, [])\n'

  const result = await check(fixture(clean))

  expect(result.ok).toBe(true)
})
