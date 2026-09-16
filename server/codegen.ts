import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config = {
  schema: '**/schema.graphql',
  generates: {
    'src/schema': defineConfig({
      scalarsOverrides: {
        Slug: { type: 'string' },
      },
    }),
  },
}
export default config
