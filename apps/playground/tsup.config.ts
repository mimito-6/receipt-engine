import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // -> public/receipt-engine.global.js (IIFE, global `ReceiptEngine`)
    // Kept for embedders/docs that load just the engine.
    entry: { 'receipt-engine': 'src/entry.ts' },
    format: ['iife'],
    globalName: 'ReceiptEngine',
    outDir: 'public',
    noExternal: [/.*/],
    minify: true,
    clean: false,
    dts: false,
    target: 'es2019',
  },
  {
    // -> public/playground.global.js (self-executing editor app, bundles the engine)
    entry: { playground: 'src/app/main.ts' },
    format: ['iife'],
    outDir: 'public',
    noExternal: [/.*/],
    minify: true,
    clean: false,
    dts: false,
    target: 'es2019',
  },
])
