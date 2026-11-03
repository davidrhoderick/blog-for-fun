import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cleanRuns, createRunDirectory, markSuccessfulRun } from './artifacts'
import { withManagedEnvironment } from './environment'
import { type FeatureManifest, readManifest } from './manifest'
import { parseFeatureOptions } from './options'
import {
  featureGrep,
  selectFeatureTests,
  validateFeatureBaseURL,
} from './playwright'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const artifactRoot = (id: string, root = projectRoot) =>
  path.join(root, '.artifacts', 'features', id)

function featureTestEnvironment(
  source: NodeJS.ProcessEnv,
  baseURL: string,
  captureDirectory?: string,
): NodeJS.ProcessEnv {
  const env = { ...source }
  for (const name of Object.keys(env)) {
    if (/^AWS_/.test(name)) delete env[name]
  }
  delete env.JEV_API_KEY
  delete env.FEATURE_CAPTURE_DIR
  env.FEATURE_BASE_URL = baseURL
  if (captureDirectory) env.FEATURE_CAPTURE_DIR = captureDirectory
  return env
}

function externalTestEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/^TURSO_/.test(name)) delete env[name]
  }
  return env
}

export async function runFeatureTests(
  id: string,
  stage: 'precheck' | 'e2e',
  capture: boolean,
  root = projectRoot,
): Promise<void> {
  const manifest = await readManifest(id, root)
  const configuredBaseURL = process.env.FEATURE_BASE_URL
  const externalBaseURL = configuredBaseURL
    ? validateFeatureBaseURL(configuredBaseURL)
    : undefined
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
  if (externalBaseURL) {
    await executeFeatureTests({
      id,
      stage,
      capture,
      manifest,
      grep,
      baseURL: externalBaseURL,
      environment: externalTestEnvironment(),
      environmentProfile: process.env.FEATURE_ENVIRONMENT_PROFILE ?? 'external',
      selectedCount: selected.length,
      root,
    })
    return
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'feature-e2e-'))
  try {
    await withManagedEnvironment(
      {
        root,
        app: manifest.app,
        databasePath: path.join(temporaryDirectory, 'feature.db'),
        removeDatabase: true,
      },
      ({ baseURL, env }) =>
        executeFeatureTests({
          id,
          stage,
          capture,
          manifest,
          grep,
          baseURL,
          environment: env,
          environmentProfile: 'managed',
          selectedCount: selected.length,
          root,
        }),
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

type FeatureTestRun = {
  id: string
  stage: 'precheck' | 'e2e'
  capture: boolean
  manifest: FeatureManifest
  grep: string
  baseURL: string
  environment: NodeJS.ProcessEnv
  environmentProfile: string
  selectedCount: number
  root: string
}

async function executeFeatureTests({
  id,
  stage,
  capture,
  manifest,
  grep,
  baseURL,
  environment,
  environmentProfile,
  selectedCount,
  root,
}: FeatureTestRun): Promise<void> {
  const run = capture ? await createRunDirectory(id, root) : undefined
  const env = featureTestEnvironment(environment, baseURL, run?.directory)
  const startedAt = new Date().toISOString()
  const result: TestResult = {
    featureId: id,
    stage,
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
      .toString()
      .trim(),
    baselineSha: manifest.acceptance.acceptedSha,
    testCount: selectedCount,
    passed: selectedCount,
    failed: 0,
    environmentProfile,
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

async function prepareContractTestGeneration(
  id: string,
  runId?: string,
  root = projectRoot,
): Promise<void> {
  const manifest = await readManifest(id, root)
  const featureArtifacts = artifactRoot(id, root)
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
  const root = projectRoot
  const [command, ...args] = process.argv.slice(2)
  const parsed = parseFeatureOptions(args)
  switch (command) {
    case 'validate':
      console.log(JSON.stringify(await readManifest(parsed.id, root), null, 2))
      return
    case 'precheck':
    case 'e2e':
      await runFeatureTests(parsed.id, command, parsed.capture === true, root)
      return
    case 'generate-tests':
      await prepareContractTestGeneration(parsed.id, parsed.run, root)
      return
    case 'clean':
      await cleanRuns(parsed.id, parsed.keep ?? 3, root)
      return
    case 'status': {
      const manifest = await readManifest(parsed.id, root)
      const latestContents = await readFile(
        path.join(artifactRoot(parsed.id, root), 'latest.json'),
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

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
