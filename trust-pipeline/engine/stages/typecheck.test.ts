import { beforeEach, expect, test, vi } from 'vitest'
import { config } from '../../project/config'
import { exec } from '../exec'
import { typecheckStage } from './typecheck'

vi.mock('../exec')

const mockedExec = vi.mocked(exec)

beforeEach(() => {
  vi.resetAllMocks()
  mockedExec.mockResolvedValue({ ok: true, output: '' })
})

const commands = () => mockedExec.mock.calls.map(([command]) => command)

test('always runs the full codegen before typecheck', {
  tags: ['unit'],
}, async () => {
  const result = await typecheckStage.run(config)

  expect(result.ok).toBe(true)
  expect(commands()).toEqual([
    config.commands.codegen,
    config.commands.typecheck,
  ])
})

test('a codegen failure fails the stage before typecheck runs', {
  tags: ['unit'],
}, async () => {
  mockedExec.mockResolvedValueOnce({ ok: false, output: 'codegen boom' })

  const result = await typecheckStage.run(config)

  expect(result.ok).toBe(false)
  expect(result.output).toContain('codegen boom')
  expect(mockedExec).toHaveBeenCalledTimes(1)
})
