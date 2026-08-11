import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROLL_LENGTH_MM,
  PAPER_58,
  PAPER_80,
  bytesPerRow,
  dotsPerMm,
  dotsToMm,
  getPaperProfile,
  mmToDots,
  receiptMetadata,
} from '../src/paper'

describe('paper profiles', () => {
  it('58mm is 384 dots and 80mm is 576 dots at 203 dpi', () => {
    expect(PAPER_58.printableWidthDots).toBe(384)
    expect(PAPER_58.dpi).toBe(203)
    expect(PAPER_80.printableWidthDots).toBe(576)
    expect(PAPER_80.dpi).toBe(203)
  })

  it('looks profiles up by id and returns undefined for unknown ids', () => {
    expect(getPaperProfile('80mm')).toBe(PAPER_80)
    expect(getPaperProfile('58mm')).toBe(PAPER_58)
    expect(getPaperProfile('a4')).toBeUndefined()
  })
})

describe('bytesPerRow', () => {
  // The single most load-bearing number in the whole ESC/POS path: it is the xL/xH
  // value of every GS v 0 header, so a wrong one shifts every row of the image.
  it('576 dots packs to 72 bytes per row', () => {
    expect(bytesPerRow(576)).toBe(72)
  })

  it('384 dots packs to 48 bytes per row', () => {
    expect(bytesPerRow(384)).toBe(48)
  })

  it('rounds a non-multiple of 8 up to a whole byte', () => {
    expect(bytesPerRow(385)).toBe(49)
    expect(bytesPerRow(1)).toBe(1)
  })
})

describe('unit conversion', () => {
  it('203 dpi is ~7.99 dots per mm', () => {
    expect(dotsPerMm(203)).toBeCloseTo(7.9921, 3)
  })

  it('round-trips mm → dots → mm', () => {
    const dots = mmToDots(80, 203)
    expect(dots).toBe(639) // 80mm of head at 203dpi
    expect(dotsToMm(dots, 203)).toBeCloseTo(80, 1)
  })

  it('12mm of feed is ~96 dots', () => {
    expect(mmToDots(12, 203)).toBe(96)
  })
})

describe('receiptMetadata', () => {
  it('reports width/length in mm including the post-print feed', () => {
    // 576 dots wide ≈ 72.1mm of head; 1600 dots tall ≈ 200.2mm, +12mm feed.
    const md = receiptMetadata({
      widthDots: 576,
      heightDots: 1600,
      dpi: 203,
      feedAfterPrintMm: 12,
    })
    expect(md.widthDots).toBe(576)
    expect(md.heightDots).toBe(1600)
    expect(md.bytesPerRow).toBe(72)
    expect(md.estimatedWidthMm).toBeCloseTo(72.08, 1)
    expect(md.estimatedLengthMm).toBeCloseTo(212.19, 1)
    expect(md.feedAfterPrintMm).toBe(12)
  })

  it('estimatedLengthMm grows by exactly the feed distance', () => {
    const base = receiptMetadata({ widthDots: 576, heightDots: 1000, dpi: 203 })
    const fed = receiptMetadata({
      widthDots: 576,
      heightDots: 1000,
      dpi: 203,
      feedAfterPrintMm: 12,
    })
    expect(fed.estimatedLengthMm - base.estimatedLengthMm).toBeCloseTo(12, 2)
  })

  it('counts receipts per 20 m roll as floor(rollLength / length)', () => {
    const md = receiptMetadata({
      widthDots: 576,
      heightDots: 1600,
      dpi: 203,
      feedAfterPrintMm: 12,
    })
    expect(md.rollLengthMm).toBe(DEFAULT_ROLL_LENGTH_MM)
    expect(md.rollLengthMm).toBe(20000)
    expect(md.estimatedReceiptsPerRoll).toBe(Math.floor(20000 / md.estimatedLengthMm))
    expect(md.estimatedReceiptsPerRoll).toBe(94)
  })

  it('honours a custom roll length', () => {
    const md = receiptMetadata({
      widthDots: 384,
      heightDots: 800,
      dpi: 203,
      feedAfterPrintMm: 10,
      rollLengthMm: 10000,
    })
    expect(md.estimatedReceiptsPerRoll).toBe(Math.floor(10000 / md.estimatedLengthMm))
  })

  it('never divides by zero for an empty receipt', () => {
    const md = receiptMetadata({ widthDots: 576, heightDots: 0 })
    expect(md.estimatedReceiptsPerRoll).toBe(0)
  })
})
