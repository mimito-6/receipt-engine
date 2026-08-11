// The defect this mode exists for: a receipt holds solid type AND faint background art on
// the same sheet, and thermal paper has no grey to compromise with. A single threshold must
// pick one of them to destroy. These tests pin down that hybrid keeps both.
import { describe, expect, it } from 'vitest'
import { toBlackMap } from '../src/dither'

const W = 64
const H = 64
const TYPE = { x0: 10, y0: 10, x1: 30, y1: 30 } // solid black block standing in for glyphs

/** A sheet of `bgLuma` paper with one solid black block on it. */
function sheet(bgLuma: number): Uint8Array {
  const rgba = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inType = x >= TYPE.x0 && x < TYPE.x1 && y >= TYPE.y0 && y < TYPE.y1
      const v = inType ? 0 : bgLuma
      const o = (y * W + x) * 4
      rgba[o] = v
      rgba[o + 1] = v
      rgba[o + 2] = v
      rgba[o + 3] = 255
    }
  }
  return rgba
}

const countIn = (m: Uint8Array, r: typeof TYPE): number => {
  let n = 0
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) n += m[y * W + x]!
  return n
}
const countOutside = (m: Uint8Array): number => {
  let n = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inType = x >= TYPE.x0 && x < TYPE.x1 && y >= TYPE.y0 && y < TYPE.y1
      if (!inType) n += m[y * W + x]!
    }
  }
  return n
}

const TYPE_AREA = (TYPE.x1 - TYPE.x0) * (TYPE.y1 - TYPE.y0)

describe('hybrid dithering', () => {
  it('keeps faint background art that a hard threshold erases entirely', () => {
    const faint = sheet(238) // lighter than any sane text threshold

    const hard = toBlackMap(faint, W, H, { dither: 'none', threshold: 170 })
    expect(countOutside(hard)).toBe(0) // the reported bug: background vanished

    const hybrid = toBlackMap(faint, W, H, { dither: 'hybrid' })
    expect(countOutside(hybrid)).toBeGreaterThan(0) // it survives as stipple
  })

  it('leaves solid type perfectly solid — no holes punched by diffusion', () => {
    const faint = sheet(238)
    const hybrid = toBlackMap(faint, W, H, { dither: 'hybrid' })
    expect(countIn(hybrid, TYPE)).toBe(TYPE_AREA)
  })

  it('beats plain floyd-steinberg on type solidity at equal background visibility', () => {
    const faint = sheet(238)
    const fs = toBlackMap(faint, W, H, { dither: 'floyd-steinberg', threshold: 170 })
    const hybrid = toBlackMap(faint, W, H, { dither: 'hybrid' })
    expect(countOutside(fs)).toBeGreaterThan(0) // FS also shows the background…
    // …but hybrid is at least as solid in the glyph, which is the whole point.
    expect(countIn(hybrid, TYPE)).toBeGreaterThanOrEqual(countIn(fs, TYPE))
    expect(countIn(hybrid, TYPE)).toBe(TYPE_AREA)
  })

  it('keeps bare paper bare — pure white never speckles', () => {
    const clean = sheet(255)
    const hybrid = toBlackMap(clean, W, H, { dither: 'hybrid' })
    expect(countOutside(hybrid)).toBe(0)
    expect(countIn(hybrid, TYPE)).toBe(TYPE_AREA)
  })

  it('honours inkFloor and paperCeil', () => {
    const mid = sheet(200)
    // paperCeil below the background makes it paper again.
    const suppressed = toBlackMap(mid, W, H, { dither: 'hybrid', paperCeil: 190 })
    expect(countOutside(suppressed)).toBe(0)
    // A low inkFloor still cannot lighten a pure-black block.
    const bold = toBlackMap(mid, W, H, { dither: 'hybrid', inkFloor: 8 })
    expect(countIn(bold, TYPE)).toBe(TYPE_AREA)
  })

  it('cannot be driven into burning the whole sheet by a bad inkFloor', () => {
    // The ink test runs before the paper test, so inkFloor >= paperCeil makes the paper
    // branch unreachable and every non-black pixel prints solid. A UI that feeds one slider
    // into both must not be able to reach that state, so the clamp lives here.
    const clean = sheet(255)
    for (const inkFloor of [250, 254, 300]) {
      const m = toBlackMap(clean, W, H, { dither: 'hybrid', inkFloor, paperCeil: 250 })
      expect(countOutside(m), `inkFloor ${inkFloor} burned the paper`).toBe(0)
    }
    // A near-white sheet is likewise still paper, not a black slab.
    const nearWhite = toBlackMap(sheet(252), W, H, { dither: 'hybrid', inkFloor: 250, paperCeil: 250 })
    expect(countOutside(nearWhite)).toBe(0)
  })

  it('darker artwork produces more ink than lighter artwork', () => {
    const light = countOutside(toBlackMap(sheet(240), W, H, { dither: 'hybrid' }))
    const dark = countOutside(toBlackMap(sheet(180), W, H, { dither: 'hybrid' }))
    expect(dark).toBeGreaterThan(light)
  })
})
