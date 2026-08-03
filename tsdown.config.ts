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
      name: 'terser',
      async renderChunk(code, chunk) {
        const isDts =
          /\.d\.(c|m)?ts$/.test(chunk.fileName) || /\bdeclare\b|\binterface\b/.test(code)
        if (isDts) return code

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
