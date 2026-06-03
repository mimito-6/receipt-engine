import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const pkg = (name: string, entry = 'src/index.ts') =>
  resolve(import.meta.dirname, 'packages', name, entry)

export default defineConfig({
  resolve: {
    alias: {
      '@receipt-engine/core': pkg('core'),
      '@receipt-engine/themes': pkg('themes'),
      '@receipt-engine/render-svg': pkg('render-svg'),
      '@receipt-engine/render-html': pkg('render-html'),
      '@receipt-engine/render-png': pkg('render-png'),
      '@receipt-engine/react': pkg('react', 'src/index.tsx'),
      '@receipt-engine/import': pkg('import'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
  },
})
