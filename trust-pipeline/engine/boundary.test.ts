import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(ENGINE_DIR, '../..')
// App directories and workspace package names the engine must never import.
const APP_DIRS = ['apps', 'packages'].map((dir) => path.join(REPO_ROOT, dir))
const APP_PACKAGES = ['server', 'admin', 'blog', '@blog']

test('the engine imports no app code', { tags: ['unit'] }, () => {
  const offenders: string[] = []
  const files = readdirSync(ENGINE_DIR, { recursive: true, encoding: 'utf8' })
  for (const file of files.filter((name) => /\.[cm]?tsx?$/.test(name))) {
    const full = path.join(ENGINE_DIR, file)
    const { importedFiles } = ts.preProcessFile(
      readFileSync(full, 'utf8'),
      true,
      true,
    )
    for (const { fileName } of importedFiles) {
      const target = path.resolve(path.dirname(full), fileName)
      const relativeApp =
        fileName.startsWith('.') &&
        APP_DIRS.some((dir) => target.startsWith(`${dir}${path.sep}`))
      const bareApp =
        !fileName.startsWith('.') &&
        APP_PACKAGES.some(
          (name) => fileName === name || fileName.startsWith(`${name}/`),
        )
      if (relativeApp || bareApp) {
        offenders.push(`${path.relative(REPO_ROOT, full)} → ${fileName}`)
      }
    }
  }

  expect(offenders).toEqual([])
})
