import { build } from 'esbuild'

// Bundled CJS dependencies call require() for Node builtins, which ESM output
// cannot do. CJS output is not an option: it empties import.meta, which the
// server's entry guard and .env lookup rely on.
const cjsInterop =
  "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Native modules and the SDK stay external: their platform binaries do not
  // survive bundling, and the SDK loads on first media use anyway.
  external: ['@node-rs/argon2', '@libsql/*', 'libsql', '@aws-sdk/*'],
  banner: { js: cjsInterop },
})
