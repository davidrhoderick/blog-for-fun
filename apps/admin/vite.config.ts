import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import relay from 'vite-plugin-relay'

export default defineConfig({
  base: '/admin/',
  plugins: [relay, tailwindcss(), reactRouter()],
  resolve: {
    dedupe: ['relay-runtime'],
    tsconfigPaths: true,
  },
  ssr: {
    noExternal: ['react-relay', 'relay-runtime'],
  },
})
