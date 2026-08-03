import { defineConfig } from 'tsdown'
import { minify } from 'terser'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  minify: true,
  format: ['esm', 'cjs'],
  plugins: [
    {
      name: 'conditional-compile',
      transform(code, id) {
        if (!/\.tsx?$/.test(id)) return
        if (!code.includes('//#ifndef PUBLISH')) return
        return code.replace(COND_RE, '')
      },
    },
    {
      name: 'terser',
      async renderChunk(code, chunk) {
        const isDts =
          /\.d\.(c|m)?ts$/.test(chunk.fileName) || /\bdeclare\b|\binterface\b/.test(code)
        if (isDts) return stripPercentEncodeFromDts(code)

        // rolldown feeds ESM code (export/import) to renderChunk even for the
        // CJS build, so detect module syntax from the source itself.
        const isModule = /(^|\n)\s*(export\s|import\s)/.test(code)
        const result = await minify(code, {
          module: isModule,
          compress: { passes: 3 },
          mangle: {
            properties: {
              reserved: ['ftp', 'file', 'http', 'https', 'ws', 'wss'],
            },
          },
        })
        return { code: result.code ?? code }
      },
    },
  ],
})

// Conditional compilation: code wrapped in `//#ifndef PUBLISH ... //#endif` is
// present only when consuming the TypeScript source directly (e.g. the Vitest
// suite, which transpiles `src/*.ts` itself and never runs this plugin), and is
// stripped out at build time. The build always behaves as if `PUBLISH` is set.
const COND_RE = /\/\/#ifndef\s+PUBLISH[\s\S]*?\/\/#endif\s*\n?/g

// The .d.ts is emitted by tsgo separately and does not pass through the
// `transform` hook above, so the non-public `percentEncode` export must be
// removed from the declaration artifact directly.
const stripPercentEncodeFromDts = (code: string) =>
  code
    .replace('declare const percentEncode: (input: string) => string;\n', '')
    .replace('export { URL, URLSearchParams, percentEncode };', 'export { URL, URLSearchParams };')
