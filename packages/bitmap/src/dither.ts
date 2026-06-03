// RGBA → grayscale → 1-bit black map, via threshold or error-diffusion dithering.

export type DitherMode = 'none' | 'floyd-steinberg' | 'atkinson'

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
  opts: { threshold?: number; dither?: DitherMode } = {},
): Uint8Array {
  const threshold = opts.threshold ?? 128
  const mode = opts.dither ?? 'none'
  const gray = toGray(rgba, width, height)
  const black = new Uint8Array(width * height)

  const at = (x: number, y: number): number => y * width + x
  const add = (x: number, y: number, err: number, f: number): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    gray[at(x, y)] += (err * f)
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y)
      const old = gray[i]!
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
