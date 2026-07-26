import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  // ...config options
  format: ['esm', 'cjs'],
})
