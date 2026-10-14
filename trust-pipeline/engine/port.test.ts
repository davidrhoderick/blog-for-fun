import { createServer } from 'node:net'
import { afterEach, expect, test } from 'vitest'
import { isPortOpen } from './port'

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

test('reports a listening port as open and a free port as closed', {
  tags: ['unit'],
}, async () => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('no port')
  close = () => server.close()

  expect(await isPortOpen(address.port)).toBe(true)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  close = undefined

  expect(await isPortOpen(address.port)).toBe(false)
})
