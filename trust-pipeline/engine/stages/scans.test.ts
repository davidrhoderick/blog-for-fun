import { expect, test } from 'vitest'
import { config } from '../../project/config'
import { scansStage } from './scans'

const withScans = (scans: string[]) => ({
  ...config,
  commands: { ...config.commands, scans },
})

test('passes when every scan command succeeds', {
  tags: ['unit'],
}, async () => {
  const result = await scansStage.run(withScans(['true', 'echo ok']))

  expect(result.ok).toBe(true)
  expect(result.output).toContain('$ echo ok')
  expect(result.output).toContain('ok')
})

test('fails when any scan command exits non-zero', {
  tags: ['unit'],
}, async () => {
  const result = await scansStage.run(withScans(['true', 'exit 3', 'true']))

  expect(result.ok).toBe(false)
  expect(result.output).toContain('$ exit 3')
})
