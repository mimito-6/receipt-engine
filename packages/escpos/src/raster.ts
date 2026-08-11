// GS v 0 raster bit-image encoding + a complete print-job builder.
import { align, cut, feed, feedDots, init } from './commands'

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
export function encodeRaster(
  bmp: Bitmap1bpp,
  opts: { maxBand?: number; skipBlankRuns?: number | false } = {},
): number[] {
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

  const band = (row: number, rows: number): void => {
    out.push(GS, 0x76, 0x30, 0x00, xL, xH, rows & 0xff, (rows >> 8) & 0xff)
    const start = row * bytesPerRow
    const end = start + rows * bytesPerRow
    for (let i = start; i < end; i++) out.push(data[i]!)
  }

  const minBlank = opts.skipBlankRuns === false ? 0 : Math.max(0, opts.skipBlankRuns ?? 8)
  if (!minBlank) {
    for (let row = 0; row < height; row += maxBand) band(row, Math.min(maxBand, height - row))
    return out
  }

  // A receipt is mostly whitespace, and a blank row still costs a full bytesPerRow of zeros —
  // 72 of them on an 80mm head. Feeding past a blank run with ESC J costs 3 bytes plus 8 to
  // reopen the band, so any run longer than ~1 row is already cheaper to skip than to send.
  // This matters far more than transfer pacing: the head consumes ~29 KB/s at 203 dpi while
  // BLE supplies a fraction of that, so the only way to stop the motor stuttering is to have
  // fewer bytes to send.
  const blankRow = (row: number): boolean => {
    const start = row * bytesPerRow
    for (let i = start; i < start + bytesPerRow; i++) if (data[i] !== 0) return false
    return true
  }

  let row = 0
  while (row < height) {
    let blank = 0
    while (row + blank < height && blankRow(row + blank)) blank++
    if (blank >= minBlank) {
      // Trailing blank rows are fed too: dropping them would shorten the receipt.
      out.push(...feedDots(blank))
      row += blank
      continue
    }
    // Short gaps stay inside the band — breaking on every one would shred the image into
    // hundreds of tiny bands and cost more in headers than the zeros are worth.
    let solid = 0
    while (row + solid < height && solid < maxBand) {
      if (blankRow(row + solid)) {
        let ahead = 0
        while (row + solid + ahead < height && blankRow(row + solid + ahead)) ahead++
        if (ahead >= minBlank) break
        solid += ahead
        continue
      }
      solid++
    }
    band(row, Math.min(solid, maxBand))
    row += Math.min(solid, maxBand)
  }
  return out
}

export interface PrintJobOptions {
  /** Center the image on the paper (default true). */
  align?: 'left' | 'center' | 'right'
  /** Lines to feed after the image before cutting (default 3). */
  feedLines?: number
  /**
   * Append a cut command. Defaults to true for backwards compatibility, but is
   * forced OFF when `supportsCut: false` — portable BLE printers have no cutter and
   * a stray `GS V` either errors or is ignored, so it must never be assumed.
   */
  cut?: boolean
  /** Partial vs full cut (default partial). */
  partialCut?: boolean
  /** Max rows per GS v 0 band (default 255). */
  maxBand?: number
  /**
   * Printer capability. When false, no cut command is emitted regardless of `cut`,
   * and the post-print advance uses `feedAfterPrintMm` so the paper clears the tear bar.
   */
  supportsCut?: boolean
  /**
   * Blank paper to advance after the image, in mm. Takes precedence over `feedLines`
   * when set: it is emitted as `ESC J` dot feeds, which are resolution-exact.
   */
  feedAfterPrintMm?: number
  /** Resolution used to convert `feedAfterPrintMm` to dots (default 203 dpi). */
  dpi?: number
  /**
   * Replace runs of this many fully blank rows with an `ESC J` feed instead of transmitting
   * them (default 8; `false` disables). Identical output on paper, materially fewer bytes.
   */
  skipBlankRuns?: number | false
}

/** 203 dpi ≈ 7.99 dots/mm — mirrors core's DEFAULT_DPI without adding a dependency. */
const DEFAULT_DPI = 203

/**
 * Build a complete print stream: init → align → raster → feed → (cut).
 *
 * With a `feedAfterPrintMm` the trailing advance is emitted in dots (`ESC J`) so the
 * receipt clears the tear bar by an exact distance; otherwise the legacy whole-line
 * `ESC d` feed is used. A printer declared `supportsCut: false` never gets a cut.
 */
export function buildPrintJob(bmp: Bitmap1bpp, opts: PrintJobOptions = {}): Uint8Array {
  // Segments are concatenated, never spread. `push(...raster)` passes one ARGUMENT per byte,
  // and a receipt's raster is tens of thousands of them — past the engine's argument limit it
  // throws "Maximum call stack size exceeded". That made the failure a function of receipt
  // LENGTH: 72 bytes/row survived 1102 rows and died at 1143.
  const segments: number[][] = [
    init(),
    align(opts.align ?? 'center'),
    encodeRaster(bmp, { maxBand: opts.maxBand, skipBlankRuns: opts.skipBlankRuns }),
    align('left'),
    opts.feedAfterPrintMm != null
      ? feedDots(Math.round(opts.feedAfterPrintMm * ((opts.dpi ?? DEFAULT_DPI) / 25.4)))
      : feed(opts.feedLines ?? 3),
  ]
  const canCut = opts.supportsCut !== false
  if (canCut && opts.cut !== false) segments.push(cut({ partial: opts.partialCut ?? true }))

  const total = segments.reduce((n, s) => n + s.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const s of segments) {
    out.set(s, at)
    at += s.length
  }
  return out
}
