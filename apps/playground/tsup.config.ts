import { defineConfig } from 'tsup'

export default defineConfig({
  // -> public/receipt-engine.global.js (IIFE, global `ReceiptEngine`)
  entry: { 'receipt-engine': 'src/entry.ts' },
  format: ['iife'],
  globalName: 'ReceiptEngine',
  outDir: 'public',
  // Bundle everything (zod, qrcode-generator, workspace pkgs) for the browser.
  noExternal: [/.*/],
  minify: true,
  clean: false,
  dts: false,
  target: 'es2019',
})
