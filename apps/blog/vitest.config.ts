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
    setupFiles: ['./test/setup.ts'],
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      include: ['app/**/*.{ts,tsx}'],
      exclude: ['app/__generated__/**', 'app/**/*.test.{ts,tsx}'],
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
