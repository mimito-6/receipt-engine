// A receipt is mostly whitespace, and a blank row still costs a full 72 bytes on an 80mm
// head. The head consumes ~29 KB/s at 203 dpi while BLE supplies a fraction of that, so the
// motor stutters whenever the stream runs dry — and the only real cure is fewer bytes.
// Eliding blank runs is free on paper, so the one thing these tests must pin down is that
// "free on paper" is literally true: the receipt has to come out the same length.
import { describe, expect, it } from 'vitest'
import { encodeRaster } from '../src/raster'

const W = 576
const BPR = 72

/** A page of `height` rows with ink only on the listed rows. */
function page(height: number, inked: (row: number) => boolean) {
  const data = new Uint8Array(BPR * height)
  for (let r = 0; r < height; r++) if (inked(r)) data.fill(0xff, r * BPR, (r + 1) * BPR)
  return { width: W, height, data }
}

/**
 * Walk an ESC/POS stream and total the paper it advances: rows inside GS v 0 bands plus dots
 * fed by ESC J. That total is the printed length, and it must not change.
 */
function paperRows(stream: number[]): { rows: number; bands: number; feeds: number } {
  let i = 0
  let rows = 0
  let bands = 0
  let feeds = 0
  while (i < stream.length) {
    if (stream[i] === 0x1d && stream[i + 1] === 0x76 && stream[i + 2] === 0x30) {
      const xL = stream[i + 4]!
      const xH = stream[i + 5]!
      const yL = stream[i + 6]!
      const yH = stream[i + 7]!
      const bytesPerRow = xL | (xH << 8)
      const bandRows = yL | (yH << 8)
      rows += bandRows
      bands++
      i += 8 + bytesPerRow * bandRows
      continue
    }
    if (stream[i] === 0x1b && stream[i + 1] === 0x4a) {
      rows += stream[i + 2]!
      feeds++
      i += 3
      continue
    }
    i++ // nothing else is emitted by encodeRaster
  }
  return { rows, bands, feeds }
}

describe('blank-run elision', () => {
  // Text lines with generous gutters: the shape of a real receipt.
  const receiptish = page(1143, (r) => r % 40 < 14)

  it('prints exactly the same length of paper', () => {
    const dense = encodeRaster(receiptish, { skipBlankRuns: false })
    const lean = encodeRaster(receiptish, { skipBlankRuns: 8 })
    expect(paperRows(dense).rows).toBe(1143)
    expect(paperRows(lean).rows).toBe(1143)
  })

  it('sends materially fewer bytes', () => {
    const dense = encodeRaster(receiptish, { skipBlankRuns: false }).length
    const lean = encodeRaster(receiptish, { skipBlankRuns: 8 }).length
    expect(lean).toBeLessThan(dense)
    // The gutters are 26 of every 40 rows — most of the saving should actually land.
    expect(lean / dense).toBeLessThan(0.55)
  })

  it('keeps every inked row — elision must only ever drop zeros', () => {
    const lean = encodeRaster(receiptish, { skipBlankRuns: 8 })
    const inkBytes = lean.filter((b) => b === 0xff).length
    const inkedRows = [...Array(1143).keys()].filter((r) => r % 40 < 14).length
    expect(inkBytes).toBe(inkedRows * BPR)
  })

  it('does not shred the image into tiny bands over one-row gaps', () => {
    // Single blank rows between inked rows must stay inside the band: a break costs 11 bytes
    // of header and would leave hundreds of bands.
    const hatched = page(510, (r) => r % 2 === 0)
    const lean = encodeRaster(hatched, { skipBlankRuns: 8 })
    expect(paperRows(lean).bands).toBeLessThanOrEqual(3) // 510 rows / 255-row cap
    expect(paperRows(lean).rows).toBe(510)
  })

  it('feeds trailing whitespace rather than truncating the receipt', () => {
    const topHeavy = page(600, (r) => r < 100)
    const lean = encodeRaster(topHeavy, { skipBlankRuns: 8 })
    expect(paperRows(lean).rows).toBe(600)
    expect(paperRows(lean).feeds).toBeGreaterThan(0)
  })

  it('handles an entirely blank page as pure feed', () => {
    const empty = page(300, () => false)
    const lean = encodeRaster(empty, { skipBlankRuns: 8 })
    expect(paperRows(lean)).toEqual({ rows: 300, bands: 0, feeds: 2 }) // 255 + 45
  })

  it('is byte-identical to the old encoder when disabled', () => {
    const solid = page(300, () => true)
    const off = encodeRaster(solid, { skipBlankRuns: false })
    const on = encodeRaster(solid, { skipBlankRuns: 8 })
    // Nothing is blank here, so the two must agree exactly.
    expect(on).toEqual(off)
  })

  it('respects the 255-row band cap while eliding', () => {
    const tall = page(2000, (r) => r % 300 < 280)
    const lean = encodeRaster(tall, { skipBlankRuns: 8 })
    expect(paperRows(lean).rows).toBe(2000)
    let i = 0
    while (i < lean.length) {
      if (lean[i] === 0x1d && lean[i + 1] === 0x76) {
        const rows = lean[i + 6]! | (lean[i + 7]! << 8)
        expect(rows).toBeLessThanOrEqual(255)
        expect(rows).toBeGreaterThan(0)
        i += 8 + (lean[i + 4]! | (lean[i + 5]! << 8)) * rows
        continue
      }
      i++
    }
  })
})
