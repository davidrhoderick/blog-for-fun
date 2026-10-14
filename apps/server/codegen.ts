import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config = {
  schema: '**/schema.graphql',
  generates: {
    'src/schema': defineConfig({
      scalarsOverrides: {
        Slug: { type: 'string' },
      },
      typesPluginsConfig: {
        contextType: '../auth/context#AuthContext',
        useTypeImports: true,
      },
    }),
  },
}
export default config
