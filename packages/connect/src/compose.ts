// High-level one-call flows that tie the browser raster bridge to the pure
// bitmap/escpos packages. Feed a (thermal) SVG string and a printer or share.
import { buildPrintJob, type PrintJobOptions } from '@receipt-engine/escpos'
import { imageDataToBitmap, type ToBitmapOptions } from '@receipt-engine/bitmap'
import type { BluetoothThermalPrinter, PrintOptions } from './bluetooth'
import { svgToImageData, svgToPngBlob } from './raster-browser'
import { shareReceipt, type ShareOptions, type ShareResult } from './share'

export interface PrintReceiptOptions {
  /** Printer head width in dots (default 384 = 58mm; use 576 for 80mm). */
  dots?: number
  bitmap?: ToBitmapOptions
  job?: PrintJobOptions
  transport?: PrintOptions
}

/**
 * Thermal print path: thermal SVG → canvas(dots) → 1-bpp → ESC/POS → printer.
 * Pass a connected (or connectable) BluetoothThermalPrinter.
 */
export async function printReceiptSvg(
  svg: string,
  printer: BluetoothThermalPrinter,
  opts: PrintReceiptOptions = {},
): Promise<void> {
  const dots = opts.dots ?? 384
  const { data, width, height } = await svgToImageData(svg, { width: dots })
  const bmp = imageDataToBitmap(data, width, height, opts.bitmap)
  const job = buildPrintJob(bmp, opts.job)
  await printer.print(job, opts.transport)
}

/** Build the ESC/POS bytes for a thermal SVG without sending (for tests/preview). */
export async function receiptSvgToEscpos(
  svg: string,
  opts: PrintReceiptOptions = {},
): Promise<Uint8Array> {
  const dots = opts.dots ?? 384
  const { data, width, height } = await svgToImageData(svg, { width: dots })
  const bmp = imageDataToBitmap(data, width, height, opts.bitmap)
  return buildPrintJob(bmp, opts.job)
}

/** Share path: SVG → PNG blob → native share sheet (download fallback). */
export async function shareReceiptSvg(
  svg: string,
  opts: ShareOptions & { pixelRatio?: number } = {},
): Promise<ShareResult> {
  const png = await svgToPngBlob(svg, { pixelRatio: opts.pixelRatio })
  return shareReceipt(png, opts)
}
