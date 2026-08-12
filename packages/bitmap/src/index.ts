// @receipt-engine/bitmap — RGBA → 1-bpp thermal bitmap.
// Browser: feed canvas ImageData. Node: feed decoded PNG RGBA. Output plugs
// straight into @receipt-engine/escpos (structurally compatible Bitmap1bpp).
import type { SpotShape } from './halftone'
import { toBlackMap, type DitherMode } from './dither'
import { packBits } from './pack'

export type { DitherMode } from './dither'
export type { SpotShape } from './halftone'
export { buildSpotMatrix, spotMatrix } from './halftone'
export { toBlackMap } from './dither'
export { packBits } from './pack'

/** 1-bpp bitmap, rows packed MSB-first, ceil(width/8) bytes per row. */
export interface Bitmap1bpp {
  width: number
  height: number
  data: Uint8Array
}

export interface ToBitmapOptions {
  /** Luminance cutoff (0–255); below = black. Default 128. */
  threshold?: number
  /** Error-diffusion mode. Default 'floyd-steinberg' (good for logos/photos). */
  dither?: DitherMode
  /** hybrid only: at or below this luminance a pixel is solid ink. Default 96. */
  inkFloor?: number
  /** hybrid only: at or above this luminance a pixel is bare paper. Default 250. */
  paperCeil?: number
  /** halftone only: screen cell shape (round / diamond / line / heart / star). */
  spot?: SpotShape
  /** halftone only: cell size in dots. Default 8, about 1mm at 203 dpi. */
  cellSize?: number
}

/**
 * Convert raw RGBA pixels (e.g. canvas ImageData.data, or decoded PNG) to a
 * 1-bpp bitmap ready for ESC/POS GS v 0. `width` should equal the printer head
 * width in dots (e.g. 384 for 58mm, 576 for 80mm) — resize before calling.
 */
export function imageDataToBitmap(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  opts: ToBitmapOptions = {},
): Bitmap1bpp {
  if (width <= 0 || height <= 0) throw new Error('bitmap: width/height must be positive')
  if (rgba.length < width * height * 4) {
    throw new Error(`bitmap: RGBA too short (have ${rgba.length}, need ${width * height * 4})`)
  }
  const black = toBlackMap(rgba, width, height, {
    threshold: opts.threshold,
    dither: opts.dither ?? 'floyd-steinberg',
    inkFloor: opts.inkFloor,
    paperCeil: opts.paperCeil,
    spot: opts.spot,
    cellSize: opts.cellSize,
  })
  return { width, height, data: packBits(black, width, height) }
}
