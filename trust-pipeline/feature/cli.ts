import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanRuns, createRunDirectory, markSuccessfulRun } from './artifacts'
import { type FeatureManifest, readManifest } from './manifest'
import { parseFeatureOptions } from './options'
import {
  assertAcceptedTestsUnchanged,
  featureGrep,
  selectFeatureTests,
  validateFeatureBaseURL,
} from './playwright'

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
  if (!configuredBaseURL) throw new Error('FEATURE_BASE_URL is required')
  const baseURL = validateFeatureBaseURL(configuredBaseURL)
  const testSources = await Promise.all(
    manifest.acceptance.tests.map(async (testPath) => ({
      accepted: execFileSync(
        'git',
        ['show', `${manifest.acceptance.acceptedSha}:${testPath}`],
        { cwd: root, encoding: 'utf8' },
      ),
      current: await readFile(path.join(root, testPath), 'utf8'),
    })),
  )
  assertAcceptedTestsUnchanged(testSources)
  const grep = featureGrep(manifest.acceptance.playwrightTag)
  const selected = selectFeatureTests(
    execFileSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--list',
        '--grep',
        grep,
        ...manifest.acceptance.tests,
      ],
      { cwd: root, encoding: 'utf8' },
    ),
    id,
    manifest.acceptance.playwrightTag,
  )
  await executeFeatureTests({
    id,
    stage,
    capture,
    manifest,
    grep,
    baseURL,
    selectedCount: selected.length,
  })
}

type FeatureTestRun = {
  id: string
  stage: 'precheck' | 'e2e'
  capture: boolean
  manifest: FeatureManifest
  grep: string
  baseURL: string
  selectedCount: number
}

async function executeFeatureTests({
  id,
  stage,
  capture,
  manifest,
  grep,
  baseURL,
  selectedCount,
}: FeatureTestRun): Promise<void> {
  const run = capture ? await createRunDirectory(id, root) : undefined
  const env = {
    ...process.env,
    FEATURE_BASE_URL: baseURL,
    ...(run ? { FEATURE_CAPTURE_DIR: run.directory } : {}),
  }
  const startedAt = new Date().toISOString()
  const result: TestResult = {
    featureId: id,
    stage,
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    baselineSha: manifest.acceptance.acceptedSha,
    testCount: selectedCount,
    passed: selectedCount,
    failed: 0,
    environmentProfile: process.env.FEATURE_ENVIRONMENT_PROFILE ?? 'external',
    artifactPaths: run ? [run.directory] : [],
    startedAt,
    finishedAt: new Date().toISOString(),
  }
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--grep',
        grep,
        ...manifest.acceptance.tests,
      ],
      { cwd: root, env, stdio: 'inherit' },
    )
    if (run) {
      const report = JSON.parse(
        await readFile(
          path.join(run.directory, 'playwright-results.json'),
          'utf8',
        ),
      ) as { stats: PlaywrightStats }
      result.passed = report.stats.expected + report.stats.flaky
      result.failed = report.stats.unexpected
      await writeResult(run, result)
      await markSuccessfulRun(id, run.runId, root)
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (run) {
      const stats = await readFile(
        path.join(run.directory, 'playwright-results.json'),
        'utf8',
      )
        .then(
          (value) => (JSON.parse(value) as { stats: PlaywrightStats }).stats,
        )
        .catch(() => undefined)
      result.passed = stats ? stats.expected + stats.flaky : 0
      result.failed = stats?.unexpected ?? selectedCount
      result.errorCategory = 'test-failure'
      await writeResult(run, result)
    }
    throw error
  }
}

async function writeResult(
  run: { directory: string },
  result: TestResult,
): Promise<void> {
  await writeFile(
    path.join(run.directory, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
}

type PlaywrightStats = { expected: number; unexpected: number; flaky: number }
type TestResult = {
  featureId: string
  stage: string
  sourceSha: string
  baselineSha: string
  testCount: number
  passed: number
  failed: number
  environmentProfile: string
  artifactPaths: string[]
  startedAt: string
  finishedAt: string
  errorCategory?: string
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
  const parsed = parseFeatureOptions(args)
  switch (command) {
    case 'validate':
      console.log(JSON.stringify(await readManifest(parsed.id, root), null, 2))
      return
    case 'precheck':
    case 'e2e':
      await runFeatureTests(parsed.id, command, parsed.capture === true)
      return
    case 'generate-tests':
      await generateTests(parsed.id, parsed.run)
      return
    case 'clean':
      await cleanRuns(parsed.id, parsed.keep ?? 3, root)
      return
    case 'status': {
      const manifest = await readManifest(parsed.id, root)
      const latestContents = await readFile(
        path.join(artifactRoot(parsed.id), 'latest.json'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) =>
        error.code === 'ENOENT' ? '' : Promise.reject(error),
      )
      const latestRun = latestContents
        ? (JSON.parse(latestContents) as { runId: string }).runId
        : null
      console.log(
        JSON.stringify(
          {
            featureId: parsed.id,
            state: manifest.state ?? 'unknown',
            latestRun,
          },
          null,
          2,
        ),
      )
      return
    }
    default:
      throw new Error(
        'Command must be validate, precheck, generate-tests, e2e, clean, or status',
      )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
