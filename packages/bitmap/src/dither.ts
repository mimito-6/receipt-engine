// RGBA → grayscale → 1-bit black map, via threshold, error diffusion, or shaped screening.
import { cellFill, spotMatrix, type SpotShape } from './halftone'

/**
 * `hybrid` exists because a single global threshold cannot satisfy a receipt that mixes
 * type with artwork. Thermal paper has no grey: a threshold high enough to catch a faint
 * background sketch (luminance ~240) also floods every light tint on the sheet, and a
 * threshold tuned for crisp type erases the sketch entirely. Plain error diffusion is no
 * better — it stipples solid glyphs into grey mush, because accumulated error from the
 * surrounding white paper punches holes through the strokes.
 *
 * hybrid splits the tonal range instead of choosing a point in it: solid ink stays solid,
 * paper stays clean, and only the mid-tones in between are dithered.
 */
export type DitherMode = 'none' | 'floyd-steinberg' | 'atkinson' | 'hybrid' | 'halftone'

/** Alpha-composite over white, then luminance (0=black … 255=white). */
function toGray(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const n = width * height
  const gray = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const a = (rgba[o + 3] ?? 255) / 255
    const r = (rgba[o] ?? 0) * a + 255 * (1 - a)
    const g = (rgba[o + 1] ?? 0) * a + 255 * (1 - a)
    const b = (rgba[o + 2] ?? 0) * a + 255 * (1 - a)
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return gray
}

/**
 * Produce a black map (Uint8Array, 1 = black dot) from RGBA. A pixel is black
 * when its (possibly error-diffused) luminance is below `threshold`.
 */
export function toBlackMap(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  opts: {
    threshold?: number
    dither?: DitherMode
    inkFloor?: number
    paperCeil?: number
    /** halftone only: screen cell shape. */
    spot?: SpotShape
    /** halftone only: cell size in dots (default 8 — about 1mm at 203 dpi). */
    cellSize?: number
  } = {},
): Uint8Array {
  const threshold = opts.threshold ?? 128
  const mode = opts.dither ?? 'none'
  // hybrid only: at or below inkFloor is solid ink, at or above paperCeil is bare paper.
  const paperCeil = opts.paperCeil ?? 250
  // Clamped BELOW paperCeil: the ink test runs first, so inkFloor >= paperCeil makes the
  // paper branch unreachable and burns the whole sheet solid black. A UI that feeds one
  // slider into both must not be able to reach that state.
  const inkFloor = Math.min(opts.inkFloor ?? 96, paperCeil - 1)
  const gray = toGray(rgba, width, height)
  const black = new Uint8Array(width * height)

  if (mode === 'halftone') {
    // Same clamps as hybrid: solid ink stays solid and paper stays clean, so type is never
    // screened. Only the tones in between are — which is the whole point, since screening
    // type would put holes in the glyphs.
    const { size, matrix } = spotMatrix(opts.cellSize ?? 8, opts.spot ?? 'round')
    const span = Math.max(1, paperCeil - inkFloor)
    for (let y = 0; y < height; y++) {
      const row = y % size
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const l = gray[i]!
        if (l <= inkFloor) {
          black[i] = 1
          continue
        }
        if (l >= paperCeil) {
          black[i] = 0
          continue
        }
        // Coverage is how much of the cell this tone wants inked. Below the size at which the
        // shape is still recognisable, cellFill holds the mark's size and thins out how many
        // cells carry one — same average coverage, but hearts instead of grit.
        const coverage = 1 - (l - inkFloor) / span
        const fill = cellFill(coverage, (x / size) | 0, (y / size) | 0)
        black[i] = matrix[row * size + (x % size)]! > 1 - fill ? 1 : 0
      }
    }
    return black
  }
  // The clamp decision must read the ORIGINAL luminance. Judging it on the error-modified
  // value is exactly how diffusion eats into solid strokes.
  const source = mode === 'hybrid' ? Float32Array.from(gray) : gray

  const at = (x: number, y: number): number => y * width + x
  const add = (x: number, y: number, err: number, f: number): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    gray[at(x, y)] += (err * f)
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y)
      const old = gray[i]!
      if (mode === 'hybrid') {
        const orig = source[i]!
        // Clamped pixels absorb their error rather than propagating it, so neither solid
        // ink nor clean paper can leak noise into its neighbours.
        if (orig <= inkFloor) {
          black[i] = 1
          continue
        }
        if (orig >= paperCeil) {
          black[i] = 0
          continue
        }
        // Mid-tone: dither it, so light artwork survives as stipple instead of vanishing.
        const on = old < (inkFloor + paperCeil) / 2
        black[i] = on ? 1 : 0
        const e = old - (on ? 0 : 255)
        add(x + 1, y, e, 7 / 16)
        add(x - 1, y + 1, e, 3 / 16)
        add(x, y + 1, e, 5 / 16)
        add(x + 1, y + 1, e, 1 / 16)
        continue
      }
      const isBlack = old < threshold
      black[i] = isBlack ? 1 : 0
      if (mode === 'none') continue
      const err = old - (isBlack ? 0 : 255)
      if (mode === 'floyd-steinberg') {
        add(x + 1, y, err, 7 / 16)
        add(x - 1, y + 1, err, 3 / 16)
        add(x, y + 1, err, 5 / 16)
        add(x + 1, y + 1, err, 1 / 16)
      } else {
        // Atkinson: diffuse 6/8 of the error to six neighbors.
        const e = err / 8
        add(x + 1, y, e, 1)
        add(x + 2, y, e, 1)
        add(x - 1, y + 1, e, 1)
        add(x, y + 1, e, 1)
        add(x + 1, y + 1, e, 1)
        add(x, y + 2, e, 1)
      }
    }
  }
  return black
}
