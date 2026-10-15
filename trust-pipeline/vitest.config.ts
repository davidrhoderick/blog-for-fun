import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    // The tsarch pattern suite runs once, in the `scans` stage, not here.
    exclude: [...configDefaults.exclude, 'project/patterns/**'],
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
