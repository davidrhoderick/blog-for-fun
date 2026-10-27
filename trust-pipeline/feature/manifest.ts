import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'

export type FeatureManifest = {
  schemaVersion: 1
  id: string
  state?: string
  acceptance: {
    acceptedSha: string
    playwrightTag: string
    tests: string[]
  }
}

const featureId = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const sha = /^[a-f\d]{40}$/i

export function assertFeatureId(id: string): void {
  if (!featureId.test(id)) throw new Error(`Invalid feature ID: ${id}`)
}

export async function readManifest(
  id: string,
  root = process.cwd(),
): Promise<FeatureManifest> {
  assertFeatureId(id)

  const manifestPath = path.join(root, 'docs/features', id, 'feature.yaml')
  const value: unknown = parse(await readFile(manifestPath, 'utf8'))
  if (!value || typeof value !== 'object')
    throw new Error(`Invalid feature manifest for ${id}`)

  const manifest = value as Partial<FeatureManifest>
  const acceptance = manifest.acceptance
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported schemaVersion')
  if (manifest.id !== id) throw new Error(`Feature manifest ID must be ${id}`)
  if (!acceptance || !sha.test(acceptance.acceptedSha))
    throw new Error('Feature manifest requires a full accepted SHA')
  if (acceptance.playwrightTag !== `@feature-${id}`)
    throw new Error(`Feature manifest tag must be @feature-${id}`)
  if (!Array.isArray(acceptance.tests) || acceptance.tests.length === 0)
    throw new Error('Feature manifest requires at least one E2E test path')

  const repo = await realpath(root)
  const testPaths = await Promise.all(
    acceptance.tests.map(async (testPath) => {
      if (
        typeof testPath !== 'string' ||
        path.isAbsolute(testPath) ||
        !testPath.startsWith('tests/')
      ) {
        throw new Error(`Invalid E2E test path: ${testPath}`)
      }
      const resolved = await realpath(path.resolve(repo, testPath))
      const relative = path.relative(repo, resolved)
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error(`E2E test path escapes repository: ${testPath}`)
      return testPath
    }),
  )

  return {
    ...manifest,
    acceptance: { ...acceptance, tests: testPaths },
  } as FeatureManifest
}
