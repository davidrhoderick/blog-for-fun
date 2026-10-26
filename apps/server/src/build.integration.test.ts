import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'

const run = promisify(execFile)
const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('The port probe did not bind'))
        return
      }
      probe.close(() => resolve(address.port))
    })
  })

test('the compiled server boots and answers /health', {
  tags: ['integration'],
}, async () => {
  await run('pnpm', ['run', 'build'], { cwd: packageRoot })

  // The media SDK is the heaviest import; keep it out of the boot path and out
  // of the bundle so a cold start never loads it.
  const bundle = await readFile(join(packageRoot, 'dist', 'server.js'), 'utf8')
  expect(bundle).toContain('import("@aws-sdk/client-s3")')
  expect(bundle).not.toContain('@smithy/')

  const directory = await mkdtemp(join(tmpdir(), 'server-build-'))
  const port = await freePort()
  const server = spawn(process.execPath, ['dist/server.js'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_CONNECTION_URL: `file:${join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (chunk) => {
    output += chunk
  })
  server.stderr.on('data', (chunk) => {
    output += chunk
  })

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`)
        if (response.ok) {
          expect(await response.text()).toBe('ok')
          return
        }
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`The compiled server did not start:\n${output}`)
  } finally {
    server.kill()
    await rm(directory, { recursive: true, force: true })
  }
})
