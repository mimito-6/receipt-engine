// GS v 0 raster bit-image encoding + a complete print-job builder.
import { align, cut, feed, init } from './commands'

/**
 * A 1-bit-per-pixel bitmap, rows packed MSB-first (leftmost pixel = bit 0x80),
 * `ceil(width/8)` bytes per row, top-to-bottom. A set bit prints a black dot.
 */
export interface Bitmap1bpp {
  width: number
  height: number
  data: Uint8Array
}

/** GS — 0x1D (re-exported for convenience). */
const GS = 0x1d

/**
 * Encode a 1-bpp bitmap as one or more `GS v 0` raster commands. Many cheap
 * printers cap a single image's height (buffer/255-row limits), so the image is
 * sliced into horizontal bands of at most `maxBand` rows, one command each.
 *
 * Header: 1D 76 30 m xL xH yL yH, then the band's packed bytes.
 *  m = 0 (normal), x = bytesPerRow = ceil(width/8), y = band height.
 */
export function encodeRaster(bmp: Bitmap1bpp, opts: { maxBand?: number } = {}): number[] {
  const { width, height, data } = bmp
  const maxBand = Math.max(1, Math.min(255, opts.maxBand ?? 255))
  const bytesPerRow = Math.ceil(width / 8)
  if (data.length < bytesPerRow * height) {
    throw new Error(
      `escpos: bitmap data too short (have ${data.length}, need ${bytesPerRow * height})`,
    )
  }
  const out: number[] = []
  const xL = bytesPerRow & 0xff
  const xH = (bytesPerRow >> 8) & 0xff
  for (let row = 0; row < height; row += maxBand) {
    const bandH = Math.min(maxBand, height - row)
    out.push(GS, 0x76, 0x30, 0x00, xL, xH, bandH & 0xff, (bandH >> 8) & 0xff)
    const start = row * bytesPerRow
    const end = start + bandH * bytesPerRow
    for (let i = start; i < end; i++) out.push(data[i]!)
  }
  return out
}

export interface PrintJobOptions {
  /** Center the image on the paper (default true). */
  align?: 'left' | 'center' | 'right'
  /** Lines to feed after the image before cutting (default 3). */
  feedLines?: number
  /** Append a cut command (default true). */
  cut?: boolean
  /** Partial vs full cut (default partial). */
  partialCut?: boolean
  /** Max rows per GS v 0 band (default 255). */
  maxBand?: number
}

/** Build a complete print stream: init → align → raster → feed → cut. */
export function buildPrintJob(bmp: Bitmap1bpp, opts: PrintJobOptions = {}): Uint8Array {
  const bytes: number[] = []
  bytes.push(...init())
  bytes.push(...align(opts.align ?? 'center'))
  bytes.push(...encodeRaster(bmp, { maxBand: opts.maxBand }))
  bytes.push(...align('left'))
  bytes.push(...feed(opts.feedLines ?? 3))
  if (opts.cut !== false) bytes.push(...cut({ partial: opts.partialCut ?? true }))
  return Uint8Array.from(bytes)
}
