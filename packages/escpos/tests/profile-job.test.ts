import { describe, expect, it } from 'vitest'
import { buildPrintJob, encodeRaster, feedDots } from '../src/index'

const GS = 0x1d
const ESC = 0x1b

/** A blank bitmap of the given dot width — only the header maths is under test. */
function blank(widthDots: number, height = 4) {
  const bytesPerRow = Math.ceil(widthDots / 8)
  return { width: widthDots, height, data: new Uint8Array(bytesPerRow * height) }
}

/** Index of the first `GS v 0` header in a byte stream. */
function rasterHeaderAt(bytes: Uint8Array | number[]): number {
  const a = Array.from(bytes)
  for (let i = 0; i < a.length - 3; i++) {
    if (a[i] === GS && a[i + 1] === 0x76 && a[i + 2] === 0x30) return i
  }
  return -1
}

describe('GS v 0 header for 80mm vs 58mm', () => {
  it('576 dots emits xL=72 xH=0 (72 bytes/row)', () => {
    const out = encodeRaster(blank(576, 10))
    expect(out.slice(0, 8)).toEqual([GS, 0x76, 0x30, 0x00, 72, 0, 10, 0])
  })

  it('384 dots emits xL=48 xH=0 (48 bytes/row)', () => {
    const out = encodeRaster(blank(384, 10))
    expect(out.slice(0, 8)).toEqual([GS, 0x76, 0x30, 0x00, 48, 0, 10, 0])
  })

  it('encodes yL/yH little-endian and bands above 255 rows', () => {
    // 300 rows must split into a 255-row band plus a 45-row band, each with its own header.
    const out = encodeRaster(blank(576, 300))
    expect(out.slice(0, 8)).toEqual([GS, 0x76, 0x30, 0x00, 72, 0, 255, 0])
    const second = out.indexOf(GS, 8 + 72 * 255)
    expect(out.slice(second, second + 8)).toEqual([GS, 0x76, 0x30, 0x00, 72, 0, 45, 0])
  })

  it('carries a >255-byte row width into xH', () => {
    // 2048 dots = 256 bytes/row → xL 0, xH 1. Proves the header is not byte-clamped.
    const out = encodeRaster(blank(2048, 1))
    expect(out.slice(0, 8)).toEqual([GS, 0x76, 0x30, 0x00, 0, 1, 1, 0])
  })

  it('emits data exactly bytesPerRow × height long after the header', () => {
    const out = encodeRaster(blank(576, 7))
    expect(out.length).toBe(8 + 72 * 7)
  })
})

describe('buildPrintJob with a cutter-less profile', () => {
  it('emits no cut command when supportsCut is false', () => {
    const bytes = buildPrintJob(blank(576), { supportsCut: false })
    const arr = Array.from(bytes)
    // GS V (0x1D 0x56) is the cut command in both function A and B forms.
    for (let i = 0; i < arr.length - 1; i++) {
      expect(arr[i] === GS && arr[i + 1] === 0x56).toBe(false)
    }
  })

  it('still emits a cut for a printer that has one', () => {
    const bytes = buildPrintJob(blank(384), { supportsCut: true })
    const arr = Array.from(bytes)
    const hasCut = arr.some((b, i) => b === GS && arr[i + 1] === 0x56)
    expect(hasCut).toBe(true)
  })

  it('supportsCut:false overrides an explicit cut:true', () => {
    const bytes = buildPrintJob(blank(576), { supportsCut: false, cut: true })
    const arr = Array.from(bytes)
    const hasCut = arr.some((b, i) => b === GS && arr[i + 1] === 0x56)
    expect(hasCut).toBe(false)
  })

  it('feeds an exact dot distance for feedAfterPrintMm (ESC J)', () => {
    // 12mm at 203dpi = 96 dots.
    const bytes = buildPrintJob(blank(576), { supportsCut: false, feedAfterPrintMm: 12, dpi: 203 })
    const arr = Array.from(bytes)
    const at = arr.findIndex((b, i) => b === ESC && arr[i + 1] === 0x4a)
    expect(at).toBeGreaterThan(-1)
    expect(arr[at + 2]).toBe(96)
  })

  it('starts with ESC @ and contains the raster', () => {
    const bytes = buildPrintJob(blank(576), { supportsCut: false })
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40])
    expect(rasterHeaderAt(bytes)).toBeGreaterThan(-1)
  })
})

describe('feedDots', () => {
  it('splits a feed longer than one byte into repeated commands', () => {
    expect(feedDots(96)).toEqual([ESC, 0x4a, 96])
    expect(feedDots(300)).toEqual([ESC, 0x4a, 255, ESC, 0x4a, 45])
    expect(feedDots(0)).toEqual([])
  })
})
