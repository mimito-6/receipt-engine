import { describe, expect, it } from 'vitest'
import { imageDataToBitmap, packBits, toBlackMap } from '@receipt-engine/bitmap'

/** Build an all-one-color RGBA buffer. */
function fill(width: number, height: number, r: number, g: number, b: number, a = 255): Uint8Array {
  const buf = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = a
  }
  return buf
}

describe('packBits', () => {
  it('packs MSB-first, 1 byte per 8px row', () => {
    // black map: leftmost + rightmost of an 8px row
    const black = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1])
    expect(Array.from(packBits(black, 8, 1))).toEqual([0b10000001])
  })
  it('pads the final byte for non-aligned widths', () => {
    const black = Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0, 0, 1]) // width 10
    const out = packBits(black, 10, 1)
    expect(out).toHaveLength(2) // ceil(10/8)
    expect(out[0]).toBe(0b11000000)
    expect(out[1]).toBe(0b01000000) // 9th pixel (x=9) → bit 0x40, rest padded 0
  })
})

describe('imageDataToBitmap', () => {
  it('all-black image → every dot set', () => {
    const bmp = imageDataToBitmap(fill(8, 2, 0, 0, 0), 8, 2, { dither: 'none' })
    expect(bmp.width).toBe(8)
    expect(Array.from(bmp.data)).toEqual([0xff, 0xff])
  })
  it('all-white image → no dots', () => {
    const bmp = imageDataToBitmap(fill(8, 2, 255, 255, 255), 8, 2, { dither: 'none' })
    expect(Array.from(bmp.data)).toEqual([0x00, 0x00])
  })
  it('treats transparent pixels as white (no dots)', () => {
    const bmp = imageDataToBitmap(fill(8, 1, 0, 0, 0, 0), 8, 1, { dither: 'none' })
    expect(Array.from(bmp.data)).toEqual([0x00])
  })
  it('threshold splits light vs dark', () => {
    const darkGray = imageDataToBitmap(fill(8, 1, 100, 100, 100), 8, 1, { dither: 'none', threshold: 128 })
    const lightGray = imageDataToBitmap(fill(8, 1, 200, 200, 200), 8, 1, { dither: 'none', threshold: 128 })
    expect(darkGray.data[0]).toBe(0xff) // L≈100 < 128 → black
    expect(lightGray.data[0]).toBe(0x00) // L≈200 ≥ 128 → white
  })
  it('produces ceil(width/8)*height bytes', () => {
    const bmp = imageDataToBitmap(fill(10, 3, 0, 0, 0), 10, 3)
    expect(bmp.data.length).toBe(2 * 3)
  })
  it('throws on short RGBA', () => {
    expect(() => imageDataToBitmap(new Uint8Array(4), 8, 8)).toThrow(/too short/)
  })

  it('Floyd–Steinberg dithers 50% gray to ~half black dots', () => {
    const w = 32
    const h = 32
    const black = toBlackMap(fill(w, h, 128, 128, 128), w, h, { dither: 'floyd-steinberg', threshold: 128 })
    let on = 0
    for (const v of black) on += v
    const ratio = on / (w * h)
    expect(ratio).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(0.7)
  })
})
