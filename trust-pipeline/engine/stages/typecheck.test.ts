import { beforeEach, expect, test, vi } from 'vitest'
import { config } from '../../project/config'
import { exec } from '../exec'
import { isPortOpen } from '../port'
import { typecheckStage } from './typecheck'

vi.mock('../exec')
vi.mock('../port')

const mockedExec = vi.mocked(exec)
const mockedPort = vi.mocked(isPortOpen)

beforeEach(() => {
  vi.resetAllMocks()
  mockedExec.mockResolvedValue({ ok: true, output: '' })
})

const commands = () => mockedExec.mock.calls.map(([command]) => command)

test('runs app codegen when the dev server port is up', {
  tags: ['unit'],
}, async () => {
  mockedPort.mockResolvedValue(true)

  const result = await typecheckStage.run(config)

  expect(result.ok).toBe(true)
  expect(commands()).toEqual([
    config.commands.codegenApps,
    config.commands.typecheck,
  ])
})

test('runs full codegen when the dev server port is down', {
  tags: ['unit'],
}, async () => {
  mockedPort.mockResolvedValue(false)

  await typecheckStage.run(config)

  expect(commands()).toEqual([
    config.commands.codegen,
    config.commands.typecheck,
  ])
})

test('a codegen failure fails the stage before typecheck runs', {
  tags: ['unit'],
}, async () => {
  mockedPort.mockResolvedValue(false)
  mockedExec.mockResolvedValueOnce({ ok: false, output: 'codegen boom' })

  const result = await typecheckStage.run(config)

  expect(result.ok).toBe(false)
  expect(result.output).toContain('codegen boom')
  expect(mockedExec).toHaveBeenCalledTimes(1)
})
