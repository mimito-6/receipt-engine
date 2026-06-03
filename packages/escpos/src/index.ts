// @receipt-engine/escpos — dependency-free, isomorphic ESC/POS encoder.
// Pairs with @receipt-engine/bitmap (image → 1-bpp) and @receipt-engine/connect
// (Web Bluetooth / WebUSB transport).
export { ESC, GS, init, feed, align, cut } from './commands'
export { encodeRaster, buildPrintJob } from './raster'
export type { Bitmap1bpp, PrintJobOptions } from './raster'
