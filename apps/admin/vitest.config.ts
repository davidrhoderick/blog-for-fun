import relay from 'vite-plugin-relay'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [relay],
  resolve: {
    dedupe: ['relay-runtime'],
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
