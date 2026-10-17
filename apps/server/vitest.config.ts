import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vitest resolves the bare `graphql` specifier to its ESM build while the
  // runtime (node/tsx) loads the CJS build; align them so the app's
  // GraphQLError instances match the ones graphql-yoga checks with instanceof.
  resolve: {
    alias: { graphql: 'graphql/index.js' },
  },
  test: {
    environment: 'node',
    tags: [{ name: 'unit' }, { name: 'integration', timeout: 30_000 }],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/schema/*.generated.ts',
        'src/db/migrate.ts',
        'src/scripts/bootstrap-auth.ts',
        'src/scripts/configure-media-cors.ts',
        'src/scripts/recover-password.ts',
      ],
      thresholds: { lines: 80, branches: 80 },
    },
  },
})
