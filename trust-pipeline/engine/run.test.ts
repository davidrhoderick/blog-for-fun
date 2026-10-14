import { expect, test, vi } from 'vitest'
import { config } from '../project/config'
import { doctor, type Tool } from './doctor'
import { runPipeline } from './run'
import type { Stage } from './stages/types'

test('stops at the first failing stage and never runs the next', {
  tags: ['unit'],
}, async () => {
  const ran: string[] = []
  const failing: Stage = {
    name: 'audit',
    run: async () => {
      ran.push('audit')
      return { name: 'audit', ok: false, output: 'found vulnerabilities' }
    },
  }
  const after: Stage = {
    name: 'lint',
    run: async () => {
      ran.push('lint')
      return { name: 'lint', ok: true, output: '' }
    },
  }

  const result = await runPipeline([failing, after], config, async () => ({
    ok: true,
    missing: [],
  }))

  expect(result.ok).toBe(false)
  expect(ran).toEqual(['audit'])
  expect(result.results).toEqual([
    { name: 'audit', ok: false, output: 'found vulnerabilities' },
  ])
})

test('fails preflight before any stage when a required tool is missing', {
  tags: ['unit'],
}, async () => {
  const run = vi.fn<Stage['run']>(async () => ({
    name: 'audit',
    ok: true,
    output: '',
  }))

  const result = await runPipeline(
    [{ name: 'audit', run }],
    config,
    async () => ({
      ok: false,
      missing: ['osv-scanner — install: brew install osv-scanner'],
    }),
  )

  expect(result.ok).toBe(false)
  expect(run).not.toHaveBeenCalled()
  expect(result.results).toHaveLength(1)
  expect(result.results[0]?.name).toBe('doctor')
  expect(result.results[0]?.output).toContain('osv-scanner')
})

test('requires the scan tools only when the scans stage is enabled', {
  tags: ['unit'],
}, async () => {
  const onlyCoreTools: (tool: Tool) => Promise<boolean> = (tool) =>
    Promise.resolve(tool.stage !== 'scans')
  const withScans = (enabled: boolean) => ({
    ...config,
    stages: { ...config.stages, scans: enabled },
  })

  const off = await doctor(withScans(false), onlyCoreTools)
  const on = await doctor(withScans(true), onlyCoreTools)

  expect(off).toEqual({ ok: true, missing: [] })
  expect(on.ok).toBe(false)
  expect(on.missing.some((entry) => entry.includes('osv-scanner'))).toBe(true)
})
