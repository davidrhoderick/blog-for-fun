import { randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { assertFeatureId } from './manifest'

const featureDirectory = (id: string, root: string) => {
  assertFeatureId(id)
  return path.join(path.resolve(root), '.artifacts', 'features', id)
}

async function ensureFeatureDirectory(directory: string): Promise<void> {
  const root = path.dirname(path.dirname(path.dirname(directory)))
  let current = root
  for (const part of ['.artifacts', 'features', path.basename(directory)]) {
    current = path.join(current, part)
    try {
      await mkdir(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`Artifact path must be a real directory: ${current}`)
  }
}

export async function createRunDirectory(
  id: string,
  root = process.cwd(),
): Promise<{ runId: string; directory: string }> {
  const directory = featureDirectory(id, root)
  await ensureFeatureDirectory(directory)
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
  const runDirectory = path.join(directory, runId)
  await mkdir(runDirectory)
  return { runId, directory: runDirectory }
}

export async function markSuccessfulRun(
  id: string,
  runId: string,
  root = process.cwd(),
): Promise<void> {
  if (
    runId.includes('/') ||
    runId.includes('\\') ||
    runId === '.' ||
    runId === '..'
  )
    throw new Error('Invalid artifact run ID')
  const directory = featureDirectory(id, root)
  await ensureFeatureDirectory(directory)
  const runDirectory = path.join(directory, runId)
  const info = await lstat(runDirectory)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`Artifact run does not exist: ${runId}`)

  const temporary = path.join(directory, `.latest-${randomUUID()}.tmp`)
  await writeFile(temporary, `${JSON.stringify({ runId })}\n`)
  await rename(temporary, path.join(directory, 'latest.json'))
}

export async function cleanRuns(
  id: string,
  keep: number,
  root = process.cwd(),
): Promise<void> {
  if (!Number.isSafeInteger(keep) || keep < 0)
    throw new Error('keep must be a non-negative integer')
  const directory = featureDirectory(id, root)
  try {
    await ensureFeatureDirectory(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  let entries: Dirent[]
  try {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Artifact feature path must be a real directory')
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  let latestRun: string | undefined
  try {
    latestRun = (
      JSON.parse(
        await readFile(path.join(directory, 'latest.json'), 'utf8'),
      ) as {
        runId: string
      }
    ).runId
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        modified: (await stat(path.join(directory, entry.name))).mtimeMs,
      })),
  )
  runs.sort(
    (left, right) =>
      Number(right.name === latestRun) - Number(left.name === latestRun) ||
      right.modified - left.modified,
  )
  const removed = runs.slice(keep)
  await Promise.all(
    removed.map(({ name }) =>
      rm(path.join(directory, name), { recursive: true, force: true }),
    ),
  )
  if (latestRun && !runs.slice(0, keep).some(({ name }) => name === latestRun))
    await rm(path.join(directory, 'latest.json'), { force: true })
}
