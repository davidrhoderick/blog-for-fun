import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
