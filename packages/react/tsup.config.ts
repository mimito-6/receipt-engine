import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Keep React (and its jsx-runtime subpath) external.
  external: [/^react/],
})
