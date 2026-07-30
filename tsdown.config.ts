import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  // ...config options
  minify: true,
  target: 'es2020',
  format: ['esm', 'cjs'],
})
