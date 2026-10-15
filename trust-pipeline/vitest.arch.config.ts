import { defineConfig } from 'vitest/config'

// The tsarch architectural-pattern suite. It is excluded from the default
// vitest glob and run once, by the `scans` stage, through this config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['project/patterns/**/*.test.ts'],
    tags: [{ name: 'integration', timeout: 120_000 }],
  },
})
