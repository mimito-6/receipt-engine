// High-level one-call flows that tie the browser raster bridge to the pure
// bitmap/escpos packages. Feed a (thermal) SVG string and a printer or share.
import { buildPrintJob, type PrintJobOptions } from '@receipt-engine/escpos'
import { imageDataToBitmap, packBits, toBlackMap, type ToBitmapOptions } from '@receipt-engine/bitmap'
import { PAPER_58, receiptMetadata, type ReceiptMetadata } from '@receipt-engine/core'
import type { PrintOptions } from './bluetooth'
import type { PrinterProfile } from './profiles'
import type { Transport, WriteOptions } from './transport'
import { svgToImageData, svgToPngBlob, type RasterImageData } from './raster-browser'
import { shareReceipt, type ShareOptions, type ShareResult } from './share'

/** Anything that can swallow ESC/POS bytes: a Transport, or the legacy printer class. */
export type PrintSink = Transport | { print(bytes: Uint8Array, opts?: PrintOptions): Promise<void> }

function sendTo(sink: PrintSink, bytes: Uint8Array, opts?: WriteOptions): Promise<void> {
  if (typeof (sink as Transport).write === 'function') {
    return (sink as Transport).write(bytes, opts)
  }
  return (sink as { print(b: Uint8Array, o?: PrintOptions): Promise<void> }).print(bytes, opts)
}

export interface PrintReceiptOptions {
  /**
   * Printer head width in dots. Defaults to the `printer` profile's paper, else 384
   * (58mm). Use 576 for 80mm.
   */
  dots?: number
  /**
   * Printer profile. Supplies the dot width, the cutter capability and the post-print
   * feed, so a cutter-less BLE printer never receives a `GS V`.
   */
  printer?: PrinterProfile
  bitmap?: ToBitmapOptions
  job?: PrintJobOptions
  transport?: PrintOptions
  /**
   * Override how the SVG becomes pixels. Defaults to the browser canvas rasterizer.
   *
   * This is the seam that makes the production print path testable at all: rasterization is
   * the one step that genuinely requires a browser, and without a way past it the entire
   * chain — profile to dot width to job options to ESC/POS bytes — had no test of any kind.
   */
  rasterize?: (svg: string, opts: { width: number }) => Promise<RasterImageData>
}

/** Resolve the raster width + job options implied by a printer profile. */
export function resolveJob(opts: PrintReceiptOptions): { dots: number; job: PrintJobOptions } {
  const paper = opts.printer?.paper
  const dots = opts.dots ?? paper?.printableWidthDots ?? PAPER_58.printableWidthDots
  const job: PrintJobOptions = {
    // A profile's capabilities are defaults; an explicit `job` still wins.
    supportsCut: opts.printer ? opts.printer.supportsCut : undefined,
    feedAfterPrintMm: opts.printer?.feedAfterPrintMm,
    dpi: paper?.dpi,
    ...opts.job,
  }
  return { dots, job }
}

/**
 * Thermal print path: thermal SVG → canvas(dots) → 1-bpp → ESC/POS → printer.
 * Accepts any Transport (or the legacy BluetoothThermalPrinter).
 */
export async function printReceiptSvg(
  svg: string,
  printer: PrintSink,
  opts: PrintReceiptOptions = {},
): Promise<void> {
  const { dots, job } = resolveJob(opts)
  const { data, width, height } = await (opts.rasterize ?? svgToImageData)(svg, { width: dots })
  const bmp = imageDataToBitmap(data, width, height, opts.bitmap)
  await sendTo(printer, buildPrintJob(bmp, job), opts.transport)
}

/** Build the ESC/POS bytes for a thermal SVG without sending (for tests/preview). */
export async function receiptSvgToEscpos(
  svg: string,
  opts: PrintReceiptOptions = {},
): Promise<Uint8Array> {
  const { dots, job } = resolveJob(opts)
  const { data, width, height } = await (opts.rasterize ?? svgToImageData)(svg, { width: dots })
  const bmp = imageDataToBitmap(data, width, height, opts.bitmap)
  return buildPrintJob(bmp, job)
}

/**
 * Bytes plus the physical metadata of what they will print. This is the shape an
 * embedding app (e.g. a POS) wants: it never has to know about `GS v 0`, band limits
 * or bytes-per-row to show "12.4 cm of paper, 161 receipts per roll".
 */
export interface EscposBuildResult {
  escposBytes: Uint8Array
  metadata: ReceiptMetadata
}

/** Rasterize a thermal SVG to ESC/POS bytes AND report the paper it will consume. */
export async function receiptSvgToEscposWithMetadata(
  svg: string,
  opts: PrintReceiptOptions = {},
): Promise<EscposBuildResult> {
  const { dots, job } = resolveJob(opts)
  const { data, width, height } = await (opts.rasterize ?? svgToImageData)(svg, { width: dots })
  const bmp = imageDataToBitmap(data, width, height, opts.bitmap)
  return {
    escposBytes: buildPrintJob(bmp, job),
    metadata: receiptMetadata({
      widthDots: width,
      heightDots: height,
      dpi: opts.printer?.paper.dpi,
      feedAfterPrintMm: job.feedAfterPrintMm,
    }),
  }
}

/** One layer of a print: what to draw, and how that content should become 1-bit. */
export interface PrintLayer {
  svg: string
  bitmap?: ToBitmapOptions
}

/**
 * Build one print from several layers, each converted to 1-bit on its own terms.
 *
 * A single conversion has to treat the whole sheet the same way, because by then a pixel is
 * just a pixel — nothing distinguishes a letter from a background sketch. Converting each
 * layer separately keeps that distinction: type can take a hard threshold and stay crisp
 * while artwork takes a screen, and the results are OR-ed, so a dot from any layer prints.
 *
 * Every layer must be rendered at the same geometry, which is what the renderer's `layers`
 * option guarantees.
 */
export async function receiptLayersToEscposWithMetadata(
  layers: PrintLayer[],
  opts: PrintReceiptOptions = {},
): Promise<EscposBuildResult> {
  if (!layers.length) throw new Error('receiptLayers: at least one layer is required')
  const { dots, job } = resolveJob(opts)
  const raster = opts.rasterize ?? svgToImageData

  let merged: Uint8Array | null = null
  let width = 0
  let height = 0
  for (const l of layers) {
    const img = await raster(l.svg, { width: dots })
    const black = toBlackMap(img.data, img.width, img.height, {
      dither: 'hybrid',
      ...l.bitmap,
    })
    if (!merged) {
      merged = black
      width = img.width
      height = img.height
      continue
    }
    if (img.width !== width || img.height !== height) {
      throw new Error(
        `receiptLayers: layer geometry differs (${width}x${height} vs ${img.width}x${img.height})`,
      )
    }
    for (let i = 0; i < merged.length; i++) if (black[i]) merged[i] = 1
  }

  const bmp = { width, height, data: packBits(merged!, width, height) }
  return {
    escposBytes: buildPrintJob(bmp, job),
    metadata: receiptMetadata({
      widthDots: width,
      heightDots: height,
      dpi: opts.printer?.paper.dpi,
      feedAfterPrintMm: job.feedAfterPrintMm,
    }),
  }
}

/** Share path: SVG → PNG blob → native share sheet (download fallback). */
export async function shareReceiptSvg(
  svg: string,
  opts: ShareOptions & { pixelRatio?: number } = {},
): Promise<ShareResult> {
  const png = await svgToPngBlob(svg, { pixelRatio: opts.pixelRatio })
  return shareReceipt(png, opts)
}
