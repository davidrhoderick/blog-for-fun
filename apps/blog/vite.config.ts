import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import relay from 'vite-plugin-relay'

// Relay ships CommonJS only, so Vite's SSR runtime externalizes it and Node
// loads it directly. `verbatimModuleSyntax` must stay off in the app tsconfig:
// Relay's generated artifacts import types (e.g. ConcreteRequest) as values,
// and with the flag on, esbuild keeps those imports, which Node then fails to
// resolve against the CommonJS package.
export default defineConfig({
  plugins: [relay, tailwindcss(), reactRouter()],
  resolve: {
    dedupe: ['relay-runtime'],
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    // Dev only: the browser transport posts to this same-origin path, which
    // production serves through the reverse proxy.
    proxy: { '/graphql': 'http://localhost:4000' },
  },
})
