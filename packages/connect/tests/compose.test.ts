// The production print path had no test of any kind, because rasterization needs a browser
// and there was no way past it. With the rasterizer injectable, everything around it — how a
// printer profile decides dot width, cutting, feed and dpi, and how those reach the ESC/POS
// stream — is checkable without hardware or a canvas.
import { describe, expect, it } from 'vitest'
import { PAPER_58, PAPER_80 } from '@receipt-engine/core'
import { receiptSvgToEscposWithMetadata, resolveJob } from '../src/compose'
import { GENERIC_BLE_58, GPRINTER_BLE_80 } from '../src/profiles'

/**
 * A stub rasterizer: a solid black sheet of the requested width.
 *
 * Alpha must be 255. Filling the whole buffer with zeros makes the sheet fully TRANSPARENT,
 * which composites to white, which blank-run elision then removes entirely — leaving a stream
 * with no raster band in it at all.
 */
const solid = (rows: number) =>
  async (_svg: string, o: { width: number }) => {
    const data = new Uint8ClampedArray(o.width * rows * 4)
    for (let i = 0; i < o.width * rows; i++) data[i * 4 + 3] = 255
    return { width: o.width, height: rows, data }
  }

/** Read the first GS v 0 band header out of a stream. */
function firstBand(bytes: Uint8Array): { bytesPerRow: number; rows: number } | null {
  for (let i = 0; i < bytes.length - 8; i++) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      return {
        bytesPerRow: bytes[i + 4]! | (bytes[i + 5]! << 8),
        rows: bytes[i + 6]! | (bytes[i + 7]! << 8),
      }
    }
  }
  return null
}

const hasCut = (b: Uint8Array): boolean => {
  for (let i = 0; i < b.length - 1; i++) if (b[i] === 0x1d && b[i + 1] === 0x56) return true
  return false
}

describe('printer profile drives the print', () => {
  it('takes the dot width from the profile, not from a hardcoded default', async () => {
    const wide = await receiptSvgToEscposWithMetadata('<svg/>', {
      printer: GPRINTER_BLE_80,
      rasterize: solid(40),
    })
    expect(wide.metadata.widthDots).toBe(576)
    expect(firstBand(wide.escposBytes)!.bytesPerRow).toBe(72)

    const narrow = await receiptSvgToEscposWithMetadata('<svg/>', {
      printer: GENERIC_BLE_58,
      rasterize: solid(40),
    })
    expect(narrow.metadata.widthDots).toBe(384)
    expect(firstBand(narrow.escposBytes)!.bytesPerRow).toBe(48)
  })

  it('never sends a cut to a printer that has no cutter', async () => {
    const r = await receiptSvgToEscposWithMetadata('<svg/>', {
      printer: GPRINTER_BLE_80,
      rasterize: solid(20),
    })
    expect(GPRINTER_BLE_80.supportsCut).toBe(false)
    expect(hasCut(r.escposBytes), 'GS V sent to a cutter-less printer').toBe(false)
  })

  it('carries the profile feed and dpi into the measurements', async () => {
    const r = await receiptSvgToEscposWithMetadata('<svg/>', {
      printer: GPRINTER_BLE_80,
      rasterize: solid(1143),
    })
    expect(r.metadata.dpi).toBe(PAPER_80.dpi)
    expect(r.metadata.feedAfterPrintMm).toBe(GPRINTER_BLE_80.feedAfterPrintMm)
    // Length is the image plus the feed, not the image alone.
    expect(r.metadata.estimatedLengthMm).toBeGreaterThan(1143 / (PAPER_80.dpi / 25.4))
    expect(r.metadata.estimatedReceiptsPerRoll).toBeGreaterThan(0)
  })

  it('lets an explicit job override the profile, and dots override the paper', async () => {
    const r = await receiptSvgToEscposWithMetadata('<svg/>', {
      printer: GPRINTER_BLE_80,
      dots: 384,
      job: { feedAfterPrintMm: 5 },
      rasterize: solid(30),
    })
    expect(r.metadata.widthDots).toBe(384)
    expect(r.metadata.feedAfterPrintMm).toBe(5)
  })

  it('falls back to 58mm only when nothing says otherwise', () => {
    expect(resolveJob({}).dots).toBe(PAPER_58.printableWidthDots)
    // …and without a profile it must not claim a cutter exists or invent a feed.
    expect(resolveJob({}).job.supportsCut).toBeUndefined()
    expect(resolveJob({}).job.feedAfterPrintMm).toBeUndefined()
  })

  it('honours the bitmap options it is given', async () => {
    // A mid-grey sheet: a hard threshold at 128 leaves it white, hybrid screens it.
    const grey = async (_svg: string, o: { width: number }) => {
      const data = new Uint8ClampedArray(o.width * 32 * 4).fill(200)
      for (let i = 0; i < o.width * 32; i++) data[i * 4 + 3] = 255
      return { width: o.width, height: 32, data }
    }
    const bytesOf = async (bitmap: Parameters<typeof receiptSvgToEscposWithMetadata>[1]['bitmap']) =>
      (await receiptSvgToEscposWithMetadata('<svg/>', { printer: GPRINTER_BLE_80, rasterize: grey, bitmap }))
        .escposBytes

    const sharp = await bytesOf({ dither: 'none', threshold: 128 })
    const hybrid = await bytesOf({ dither: 'hybrid' })
    const ink = (b: Uint8Array): number => {
      let n = 0
      for (const x of b) for (let k = 0; k < 8; k++) n += (x >> k) & 1
      return n
    }
    expect(ink(sharp)).toBeLessThan(ink(hybrid))
  })
})
