import { describe, expect, it } from 'vitest'
import {
  align,
  buildPrintJob,
  cut,
  encodeRaster,
  feed,
  init,
  type Bitmap1bpp,
} from '@receipt-engine/escpos'

describe('commands', () => {
  it('init = ESC @', () => {
    expect(init()).toEqual([0x1b, 0x40])
  })
  it('feed = ESC d n (clamped)', () => {
    expect(feed(3)).toEqual([0x1b, 0x64, 3])
    expect(feed(999)).toEqual([0x1b, 0x64, 255])
  })
  it('align = ESC a n', () => {
    expect(align('left')).toEqual([0x1b, 0x61, 0])
    expect(align('center')).toEqual([0x1b, 0x61, 1])
    expect(align('right')).toEqual([0x1b, 0x61, 2])
  })
  it('cut: partial / full / feed-and-cut', () => {
    expect(cut()).toEqual([0x1d, 0x56, 1])
    expect(cut({ partial: false })).toEqual([0x1d, 0x56, 0])
    expect(cut({ feedUnits: 10 })).toEqual([0x1d, 0x56, 66, 10])
  })
})

describe('encodeRaster (GS v 0)', () => {
  it('emits the exact header + data for a small bitmap', () => {
    // 8×2 → 1 byte/row, 2 rows
    const bmp: Bitmap1bpp = { width: 8, height: 2, data: Uint8Array.from([0b10000001, 0b01000010]) }
    expect(encodeRaster(bmp)).toEqual([
      0x1d, 0x76, 0x30, 0x00, // GS v 0 m
      0x01, 0x00, // xL xH = bytesPerRow 1
      0x02, 0x00, // yL yH = height 2
      0b10000001,
      0b01000010,
    ])
  })

  it('bytesPerRow = ceil(width/8) for non-byte-aligned widths', () => {
    const bmp: Bitmap1bpp = { width: 10, height: 1, data: Uint8Array.from([0xff, 0xc0]) }
    const out = encodeRaster(bmp)
    expect(out.slice(0, 6)).toEqual([0x1d, 0x76, 0x30, 0x00, 0x02, 0x00]) // x = 2
  })

  it('slices tall images into ≤maxBand-row bands', () => {
    const width = 8
    const height = 300
    const data = new Uint8Array(height) // 1 byte/row
    const out = encodeRaster({ width, height, data }, { maxBand: 255 })
    // two GS v 0 headers
    const headers = []
    for (let i = 0; i < out.length; i++) {
      if (out[i] === 0x1d && out[i + 1] === 0x76 && out[i + 2] === 0x30) headers.push(i)
    }
    expect(headers).toHaveLength(2)
    // first band height 255, second 45
    expect(out[headers[0] + 6]).toBe(255)
    expect(out[headers[1] + 6]).toBe(45)
    // total bytes = 2 headers (8 each) + 300 data
    expect(out.length).toBe(2 * 8 + 300)
  })

  it('throws when data is too short', () => {
    expect(() => encodeRaster({ width: 8, height: 4, data: new Uint8Array(2) })).toThrow(/too short/)
  })
})

describe('buildPrintJob', () => {
  it('wraps init → center → raster → feed → cut', () => {
    const bmp: Bitmap1bpp = { width: 8, height: 1, data: Uint8Array.from([0xff]) }
    const job = buildPrintJob(bmp, { feedLines: 4 })
    expect(job).toBeInstanceOf(Uint8Array)
    // starts with ESC @
    expect([job[0], job[1]]).toEqual([0x1b, 0x40])
    // contains a GS v 0 raster
    const s = Array.from(job)
    const idx = s.findIndex((b, i) => b === 0x1d && s[i + 1] === 0x76 && s[i + 2] === 0x30)
    expect(idx).toBeGreaterThan(-1)
    // ends with a cut
    expect([job[job.length - 3], job[job.length - 2], job[job.length - 1]]).toEqual([0x1d, 0x56, 1])
  })

  it('can omit the cut', () => {
    const bmp: Bitmap1bpp = { width: 8, height: 1, data: Uint8Array.from([0xff]) }
    const job = Array.from(buildPrintJob(bmp, { cut: false }))
    expect(job.slice(-2)).not.toEqual([0x1d, 0x56])
  })
})
