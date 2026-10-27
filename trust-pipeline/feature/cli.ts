import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanRuns, createRunDirectory, markSuccessfulRun } from './artifacts'
import { readManifest } from './manifest'
import {
  featureGrep,
  selectFeatureTests,
  validateFeatureBaseURL,
} from './playwright'

type Options = { id?: string; capture?: boolean; run?: string; keep?: number }

function options(args: string[]): Options {
  const result: Options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--capture') result.capture = true
    else if (arg === '--id') result.id = args[++index]
    else if (arg === '--run') result.run = args[++index]
    else if (arg === '--keep') result.keep = Number(args[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!result.id) throw new Error('Pass --id <FEATURE_ID>')
  return result
}

const root = process.cwd()
const artifactRoot = (id: string) =>
  path.join(root, '.artifacts', 'features', id)

async function runFeatureTests(
  id: string,
  stage: 'precheck' | 'e2e',
  capture: boolean,
): Promise<void> {
  const manifest = await readManifest(id, root)
  const configuredBaseURL = process.env.FEATURE_BASE_URL
  if (!configuredBaseURL)
    throw new Error('Set FEATURE_BASE_URL from the feature environment profile')
  const baseURL = validateFeatureBaseURL(configuredBaseURL)

  const grep = featureGrep(manifest.acceptance.playwrightTag)
  const testArgs = [...manifest.acceptance.tests]
  const listOutput = execFileSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--list', '--grep', grep, ...testArgs],
    { cwd: root, encoding: 'utf8' },
  )
  const selected = selectFeatureTests(
    listOutput,
    id,
    manifest.acceptance.playwrightTag,
  )
  const run = capture ? await createRunDirectory(id, root) : undefined
  const env = {
    ...process.env,
    FEATURE_BASE_URL: baseURL,
    ...(run ? { FEATURE_CAPTURE_DIR: run.directory } : {}),
  }
  const startedAt = new Date().toISOString()
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const artifactPaths = run ? [run.directory] : []

  try {
    execFileSync(
      'pnpm',
      ['exec', 'playwright', 'test', '--grep', grep, ...testArgs],
      { cwd: root, env, stdio: 'inherit' },
    )
    const playwrightResult = run
      ? (JSON.parse(
          await readFile(
            path.join(run.directory, 'playwright-results.json'),
            'utf8',
          ),
        ) as { stats: { expected: number; unexpected: number; flaky: number } })
      : undefined
    const result = {
      featureId: id,
      stage,
      sourceSha,
      baselineSha: manifest.acceptance.acceptedSha,
      testCount: selected.length,
      passed: playwrightResult
        ? playwrightResult.stats.expected + playwrightResult.stats.flaky
        : selected.length,
      failed: playwrightResult?.stats.unexpected ?? 0,
      environmentProfile: process.env.FEATURE_ENVIRONMENT_PROFILE ?? 'external',
      artifactPaths,
      startedAt,
      finishedAt: new Date().toISOString(),
    }
    if (run) {
      await writeFile(
        path.join(run.directory, 'result.json'),
        `${JSON.stringify(result, null, 2)}\n`,
      )
      await markSuccessfulRun(id, run.runId, root)
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (run) {
      let failed = selected.length
      try {
        const report = JSON.parse(
          await readFile(
            path.join(run.directory, 'playwright-results.json'),
            'utf8',
          ),
        ) as { stats: { unexpected: number } }
        failed = report.stats.unexpected
      } catch {
        // Playwright can fail before writing its JSON report.
      }
      await writeFile(
        path.join(run.directory, 'result.json'),
        `${JSON.stringify(
          {
            featureId: id,
            stage,
            sourceSha,
            baselineSha: manifest.acceptance.acceptedSha,
            testCount: selected.length,
            passed: Math.max(0, selected.length - failed),
            failed,
            environmentProfile:
              process.env.FEATURE_ENVIRONMENT_PROFILE ?? 'external',
            artifactPaths,
            startedAt,
            finishedAt: new Date().toISOString(),
            errorCategory: 'test-failure',
          },
          null,
          2,
        )}\n`,
      )
    }
    throw error
  }
}

async function generateTests(id: string, runId?: string): Promise<void> {
  const manifest = await readManifest(id, root)
  const featureArtifacts = artifactRoot(id)
  const latest = JSON.parse(
    await readFile(path.join(featureArtifacts, 'latest.json'), 'utf8'),
  ) as { runId: string }
  const selectedRun = runId ?? latest.runId
  if (selectedRun !== latest.runId)
    throw new Error('Only the latest successful capture can be used')
  const runDirectory = path.join(featureArtifacts, selectedRun)
  const evidence = JSON.parse(
    await readFile(path.join(runDirectory, 'result.json'), 'utf8'),
  ) as { featureId?: string; passed?: number; failed?: number }
  if (evidence.featureId !== id || !evidence.passed || evidence.failed)
    throw new Error(`Capture ${selectedRun} did not pass for ${id}`)

  const brief = [
    `# Contract test generation: ${id}`,
    '',
    `Accepted SHA: ${manifest.acceptance.acceptedSha}`,
    `Playwright tag: ${manifest.acceptance.playwrightTag}`,
    `Tests: ${manifest.acceptance.tests.join(', ')}`,
    `Capture: ${runDirectory}`,
    '',
    'Use the recordings as provisional evidence. Do not infer product requirements.',
  ].join('\n')
  await writeFile(path.join(runDirectory, 'generation-brief.md'), `${brief}\n`)
  console.log(
    JSON.stringify(
      {
        featureId: id,
        runId: selectedRun,
        brief: path.join(runDirectory, 'generation-brief.md'),
      },
      null,
      2,
    ),
  )
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  const parsed = options(args)
  const id = parsed.id
  if (!id) throw new Error('Pass --id <FEATURE_ID>')
  if (command === 'validate') {
    console.log(JSON.stringify(await readManifest(id, root), null, 2))
  } else if (command === 'precheck' || command === 'e2e') {
    await runFeatureTests(id, command, parsed.capture === true)
  } else if (command === 'generate-tests') {
    await generateTests(id, parsed.run)
  } else if (command === 'clean') {
    await cleanRuns(id, parsed.keep ?? 3, root)
  } else if (command === 'status') {
    const manifest = await readManifest(id, root)
    let latest: string | null = null
    try {
      latest = (
        JSON.parse(
          await readFile(path.join(artifactRoot(id), 'latest.json'), 'utf8'),
        ) as { runId: string }
      ).runId
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    console.log(
      JSON.stringify(
        {
          featureId: id,
          state: manifest.state ?? 'unknown',
          latestRun: latest,
        },
        null,
        2,
      ),
    )
  } else {
    throw new Error(
      'Command must be validate, precheck, generate-tests, e2e, clean, or status',
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
