// tsdown.config.ts — the web client half's bundler preset, mirroring the
// dsh-input-traffic client semantics (which mirror dsh's own client build):
//
// - entry src/client/index.ts -> dist/client.js (CJS, browser) carrying the
//   `window.__ModuleLoader__.load({ id, factory })` closure-factory wrapper,
//   exactly the shape the old hand-written src/client.js bundle had.
// - The bundle is served by dsh's client module table at ./client; `react` is
//   a platform seed word (external — resolved through the shared module
//   table), everything else is inlined. The host half stays on plain tsc
//   (tsconfig.json); this config only knows the browser bundle.
import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-paste-dock'

/** The module specifiers the shell shares into the frozen module table. */
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime'] as const

export default defineConfig({
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: false,
  clean: false,
  minify: false,
  external: [...CLIENT_EXTERNALS],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
