import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { readManifest } from './manifest'

let root = ''

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

const createFeature = async (yaml: string) => {
  if (root) await rm(root, { recursive: true, force: true })
  root = await mkdtemp(path.join(tmpdir(), 'feature-manifest-'))
  await mkdir(path.join(root, 'docs/features/INS-123'), { recursive: true })
  await mkdir(path.join(root, 'tests'), { recursive: true })
  await writeFile(path.join(root, 'tests/comments.spec.ts'), '')
  await writeFile(path.join(root, 'docs/features/INS-123/feature.yaml'), yaml)
}

const validManifest = `schemaVersion: 1
id: INS-123
title: Add comments
state: ACCEPTED
acceptance:
  acceptedSha: '1111111111111111111111111111111111111111'
  playwrightTag: '@feature-INS-123'
  tests:
    - tests/comments.spec.ts
`

test('reads a valid feature manifest and its existing test path', {
  tags: ['unit'],
}, async () => {
  await createFeature(validManifest)

  const manifest = await readManifest('INS-123', root)

  expect(manifest.id).toBe('INS-123')
  expect(manifest.acceptance.tests).toEqual(['tests/comments.spec.ts'])
})

test('rejects missing manifest and mismatched manifest id', {
  tags: ['unit'],
}, async () => {
  await createFeature(validManifest.replace('id: INS-123', 'id: INS-124'))

  await expect(readManifest('INS-999', root)).rejects.toThrow(/manifest/i)
  await expect(readManifest('INS-123', root)).rejects.toThrow(/id/i)
})

test('rejects invalid accepted SHA, missing E2E test, and path traversal', {
  tags: ['unit'],
}, async () => {
  await createFeature(validManifest.replace('1'.repeat(40), 'bad-sha'))
  await expect(readManifest('INS-123', root)).rejects.toThrow(/sha/i)

  await createFeature(
    validManifest.replace('tests/comments.spec.ts', 'tests/missing.spec.ts'),
  )
  await expect(readManifest('INS-123', root)).rejects.toThrow(/test/i)

  await createFeature(
    validManifest.replace('tests/comments.spec.ts', '../outside.spec.ts'),
  )
  await expect(readManifest('INS-123', root)).rejects.toThrow(/path/i)
})

test('rejects feature IDs that can escape the manifest directory', {
  tags: ['unit'],
}, async () => {
  await createFeature(validManifest)

  await expect(readManifest('../INS-123', root)).rejects.toThrow(/id/i)
})
