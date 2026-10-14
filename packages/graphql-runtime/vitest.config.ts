import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
