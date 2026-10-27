import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  utimes,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { cleanRuns, createRunDirectory, markSuccessfulRun } from './artifacts'

let root = ''

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

test('creates unique run directories without overwriting previous output', {
  tags: ['unit'],
}, async () => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-artifacts-'))

  const first = await createRunDirectory('INS-123', root)
  const second = await createRunDirectory('INS-123', root)

  expect(first.directory).not.toBe(second.directory)
  expect(
    await readdir(path.join(root, '.artifacts/features/INS-123')),
  ).toHaveLength(2)
})

test('keeps the newest requested runs and does not touch sibling feature IDs', {
  tags: ['unit'],
}, async () => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-artifacts-'))
  const old = await createRunDirectory('INS-123', root)
  const middle = await createRunDirectory('INS-123', root)
  const newest = await createRunDirectory('INS-123', root)
  const sibling = await createRunDirectory('INS-1234', root)
  const epoch = new Date('2026-01-01T00:00:00Z')
  await utimes(old.directory, epoch, epoch)
  await utimes(
    middle.directory,
    new Date(epoch.getTime() + 1000),
    new Date(epoch.getTime() + 1000),
  )
  await utimes(
    newest.directory,
    new Date(epoch.getTime() + 2000),
    new Date(epoch.getTime() + 2000),
  )

  await cleanRuns('INS-123', 2, root)

  expect(await readdir(path.join(root, '.artifacts/features/INS-123'))).toEqual(
    [middle.runId, newest.runId].sort(),
  )
  expect(await readdir(sibling.directory)).toEqual([])
})

test('updates latest only for successful run and rejects invalid cleanup input', {
  tags: ['unit'],
}, async () => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-artifacts-'))
  const run = await createRunDirectory('INS-123', root)

  await markSuccessfulRun('INS-123', run.runId, root)

  expect(
    JSON.parse(
      await readFile(
        path.join(root, '.artifacts/features/INS-123/latest.json'),
        'utf8',
      ),
    ),
  ).toEqual({ runId: run.runId })
  await expect(cleanRuns('../INS-123', 1, root)).rejects.toThrow(/id/i)
  await expect(cleanRuns('INS-123', -1, root)).rejects.toThrow(/keep/i)
})

test('cleanup keeps the latest successful capture ahead of newer failed runs', {
  tags: ['unit'],
}, async () => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-artifacts-'))
  const successful = await createRunDirectory('INS-123', root)
  await markSuccessfulRun('INS-123', successful.runId, root)
  const failed = await createRunDirectory('INS-123', root)

  await cleanRuns('INS-123', 1, root)

  expect(
    await readdir(path.join(root, '.artifacts/features/INS-123')),
  ).toContain(successful.runId)
  expect(
    await readdir(path.join(root, '.artifacts/features/INS-123')),
  ).not.toContain(failed.runId)
})

test('rejects artifact parent symlinks before writing', {
  tags: ['unit'],
}, async () => {
  root = await mkdtemp(path.join(tmpdir(), 'feature-artifacts-'))
  const outside = await mkdtemp(
    path.join(tmpdir(), 'feature-artifacts-outside-'),
  )
  await symlink(outside, path.join(root, '.artifacts'))

  await expect(createRunDirectory('INS-123', root)).rejects.toThrow(
    /real directory/i,
  )
  expect(await readdir(outside)).toEqual([])
  await rm(outside, { recursive: true, force: true })
})
