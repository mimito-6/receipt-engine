// Shaped screening: an alternative to error diffusion for mid-tones, where the dot grows in
// a chosen shape instead of scattering as noise.
//
// The defect these tests exist for was invisible at light tones and obvious at dark ones: the
// threshold ordering ran opposite to the comparison, so the dot grew from the cell corners
// inward and printed the exact COMPLEMENT of the shape — hearts showed up as white holes in a
// dark field rather than as marks on a light one. Coverage was correct throughout, so no
// tonal assertion could have caught it.
import { describe, expect, it } from 'vitest'
import { toBlackMap } from '../src/dither'
import { buildSpotMatrix, type SpotShape } from '../src/halftone'

const SHAPES: SpotShape[] = ['round', 'diamond', 'line', 'heart', 'star']
const CELL = 12
const N = CELL * 4

/** A flat field of luminance `l`. */
function flat(l: number, size = N): Uint8Array {
  const rgba = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = l
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

const screen = (l: number, spot: SpotShape, size = N): Uint8Array =>
  toBlackMap(flat(l, size), size, size, { dither: 'halftone', spot, cellSize: CELL, inkFloor: 8, paperCeil: 250 })

const coverage = (m: Uint8Array): number => m.reduce((n, v) => n + v, 0) / m.length

describe('shaped halftone', () => {
  it('inks from the middle of the cell outward, not from its corners', () => {
    // The complement bug in one assertion. At a light tone only a few cells per screen cell
    // carry ink; they must be the ones nearest the shape's centre.
    for (const spot of ['round', 'heart', 'star'] as SpotShape[]) {
      const m = screen(228, spot, CELL) // one cell, lightly inked
      const inked: Array<[number, number]> = []
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (m[y * CELL + x]) inked.push([x, y])
      expect(inked.length, `${spot}: nothing inked to judge`).toBeGreaterThan(0)

      const mid = (CELL - 1) / 2
      const meanDist =
        inked.reduce((s, [x, y]) => s + Math.hypot(x - mid, y - mid), 0) / inked.length
      // Corners of a 12x12 cell are ~7.8 away; the centre region is under half that.
      expect(meanDist, `${spot} inked the corners first`).toBeLessThan(mid * 0.75)
    }
  })

  it('grows monotonically: darker tone never removes ink', () => {
    for (const spot of SHAPES) {
      let prev = -1
      for (const l of [240, 220, 190, 160, 130, 100, 60, 20]) {
        const c = coverage(screen(l, spot))
        expect(c, `${spot} at L${l} went backwards`).toBeGreaterThanOrEqual(prev)
        prev = c
      }
    }
  })

  it('reproduces tone identically whatever the shape — only the texture differs', () => {
    for (const l of [220, 180, 140, 100]) {
      const cs = SHAPES.map((s) => coverage(screen(l, s)))
      for (const c of cs) expect(c).toBeCloseTo(cs[0]!, 6)
      // And it tracks the requested tone: coverage ~ how far below paper the tone sits.
      expect(cs[0]!).toBeCloseTo(1 - (l - 8) / (250 - 8), 1)
    }
    // Identical tone must NOT mean identical output, or the shape choice does nothing.
    const a = screen(180, 'heart')
    const b = screen(180, 'star')
    expect(a).not.toEqual(b)
  })

  it('leaves type solid and paper bare — only mid-tones are screened', () => {
    for (const spot of SHAPES) {
      expect(coverage(screen(0, spot)), `${spot} failed to keep ink solid`).toBe(1)
      expect(coverage(screen(255, spot)), `${spot} speckled bare paper`).toBe(0)
    }
  })

  it('uses every level exactly once, so a flat tone cannot band', () => {
    for (const spot of SHAPES) {
      const m = buildSpotMatrix(CELL, spot)
      const sorted = [...m].sort((x, y) => x - y)
      expect(new Set(sorted).size, `${spot} repeats a threshold`).toBe(CELL * CELL)
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i]).toBeCloseTo((i + 0.5) / (CELL * CELL), 6)
      }
    }
  })

  it('tiles seamlessly — the pattern repeats on the cell, with no seam', () => {
    const m = screen(170, 'heart')
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N - CELL; x++) {
        expect(m[y * N + x], `seam at ${x},${y}`).toBe(m[y * N + x + CELL])
      }
    }
  })
})
