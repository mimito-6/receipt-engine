// Paper profiles: the single source of truth for "how wide is this receipt, in dots".
//
// A thermal print head is a fixed row of dots (203 dpi ≈ 7.99 dots/mm). Everything
// downstream — SVG layout width, the 1-bpp raster, and the `GS v 0` bytes-per-row —
// must agree on that number, so it lives here (pure data, no deps) rather than being
// re-declared in each package.
//
// Rendering at 576 dots means LAYING OUT at 576 dots. It must never mean rendering a
// 384-dot image and scaling it up: upscaling a 1-bpp raster smears every edge.

/** Print-head resolution shared by virtually all 58/80mm thermal printers. */
export const DEFAULT_DPI = 203

/** Default thermal roll length used for the "how many receipts fit" estimate. */
export const DEFAULT_ROLL_LENGTH_MM = 20000

export interface PaperProfile {
  /** Stable id, e.g. `'58mm'` / `'80mm'`. */
  id: string
  /** Human label for pickers. */
  name: string
  /** Nominal physical paper width in mm (58 / 80). */
  widthMm: number
  /**
   * Printable width in DOTS — the number that drives layout and raster width.
   * 58mm → 384 (48 bytes/row), 80mm → 576 (72 bytes/row).
   */
  printableWidthDots: number
  /** Print-head resolution in dots per inch. */
  dpi: number
  /** Blank paper fed after the image so the receipt clears the tear bar, in mm. */
  feedAfterPrintMm: number
  /** Layout: margin OUTSIDE the card, in dots (per side). */
  outerMarginDots: number
  /** Layout: padding INSIDE the card, in dots (per side). */
  sidePaddingDots: number
  /** Layout: QR code box size, in dots. */
  qrSizeDots: number
  /** Layout: max logo box, in dots. */
  logoMaxWidthDots: number
  logoMaxHeightDots: number
}

/**
 * 58mm / 384 dots. The layout numbers deliberately match what the renderer used
 * before paper profiles existed, so selecting this profile is a no-op visually.
 */
export const PAPER_58: PaperProfile = {
  id: '58mm',
  name: '58mm · 384 dots',
  widthMm: 58,
  printableWidthDots: 384,
  dpi: DEFAULT_DPI,
  feedAfterPrintMm: 12,
  outerMarginDots: 22,
  sidePaddingDots: 18,
  qrSizeDots: 120,
  logoMaxWidthDots: 160,
  logoMaxHeightDots: 76,
}

/**
 * 80mm / 576 dots. Structural spacing and graphics scale with the wider head
 * (×1.5) so the sheet stays visually balanced; body text keeps its absolute size,
 * which is what gives an 80mm receipt more characters per line instead of bigger type.
 */
export const PAPER_80: PaperProfile = {
  id: '80mm',
  name: '80mm · 576 dots',
  widthMm: 80,
  printableWidthDots: 576,
  dpi: DEFAULT_DPI,
  feedAfterPrintMm: 12,
  outerMarginDots: 33,
  sidePaddingDots: 27,
  qrSizeDots: 180,
  logoMaxWidthDots: 240,
  logoMaxHeightDots: 114,
}

/** Built-in profiles by id. */
export const PAPER_PROFILES: Record<string, PaperProfile> = {
  [PAPER_58.id]: PAPER_58,
  [PAPER_80.id]: PAPER_80,
}

/** Look up a built-in profile by id; returns undefined for unknown ids. */
export function getPaperProfile(id: string): PaperProfile | undefined {
  return PAPER_PROFILES[id]
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

/** Dots per millimetre for a resolution. 203 dpi ≈ 7.9921 dots/mm. */
export function dotsPerMm(dpi: number = DEFAULT_DPI): number {
  return dpi / 25.4
}

/** Millimetres → dots (rounded to a whole dot; a print head cannot fire half a dot). */
export function mmToDots(mm: number, dpi: number = DEFAULT_DPI): number {
  return Math.round(mm * dotsPerMm(dpi))
}

/** Dots → millimetres (not rounded; callers decide their own precision). */
export function dotsToMm(dots: number, dpi: number = DEFAULT_DPI): number {
  return dots / dotsPerMm(dpi)
}

/**
 * Bytes per raster row for a width in dots — the `xL`/`xH` value in a `GS v 0`
 * header. 384 → 48, 576 → 72.
 */
export function bytesPerRow(widthDots: number): number {
  return Math.ceil(widthDots / 8)
}

// ---------------------------------------------------------------------------
// Receipt metadata
// ---------------------------------------------------------------------------

/** Everything a caller needs to know about a rendered receipt's physical size. */
export interface ReceiptMetadata {
  /** Raster width in dots (= profile printableWidthDots). */
  widthDots: number
  /** Raster height in dots (the rendered receipt height). */
  heightDots: number
  dpi: number
  /** Physical width of the printed area. */
  estimatedWidthMm: number
  /** Physical paper consumed: the image itself PLUS the post-print feed. */
  estimatedLengthMm: number
  /** The feed included in `estimatedLengthMm`. */
  feedAfterPrintMm: number
  /** Roll length the estimate assumes. */
  rollLengthMm: number
  /** floor(rollLengthMm / estimatedLengthMm). */
  estimatedReceiptsPerRoll: number
  /** Raster bytes per row — 48 at 384 dots, 72 at 576. */
  bytesPerRow: number
}

export interface ReceiptMetadataInput {
  widthDots: number
  heightDots: number
  dpi?: number
  /** Blank feed after the image, in mm. Defaults to 0 (caller usually passes the profile's). */
  feedAfterPrintMm?: number
  rollLengthMm?: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Derive physical metadata from a rendered receipt's pixel dimensions.
 *
 * `estimatedLengthMm` covers the whole paper cost of one receipt: the raster body
 * (which already includes the rendered top/bottom margins) plus the blank feed after
 * printing — so `estimatedReceiptsPerRoll` reflects reality, not just image height.
 */
export function receiptMetadata(input: ReceiptMetadataInput): ReceiptMetadata {
  const dpi = input.dpi ?? DEFAULT_DPI
  const feedAfterPrintMm = input.feedAfterPrintMm ?? 0
  const rollLengthMm = input.rollLengthMm ?? DEFAULT_ROLL_LENGTH_MM
  const estimatedWidthMm = round2(dotsToMm(input.widthDots, dpi))
  const estimatedLengthMm = round2(dotsToMm(input.heightDots, dpi) + feedAfterPrintMm)
  return {
    widthDots: input.widthDots,
    heightDots: input.heightDots,
    dpi,
    estimatedWidthMm,
    estimatedLengthMm,
    feedAfterPrintMm,
    rollLengthMm,
    estimatedReceiptsPerRoll:
      estimatedLengthMm > 0 ? Math.floor(rollLengthMm / estimatedLengthMm) : 0,
    bytesPerRow: bytesPerRow(input.widthDots),
  }
}
