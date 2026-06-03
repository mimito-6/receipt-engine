import { defineConfig } from 'tsup'

export default defineConfig({
  // -> public/openbooth-receipt-bridge.global.js (IIFE; sets window.ReceiptBridge)
  entry: { 'openbooth-receipt-bridge': 'src/bridge.ts' },
  format: ['iife'],
  outDir: 'public',
  noExternal: [/.*/],
  minify: true,
  clean: false,
  dts: false,
  target: 'es2019',
})
