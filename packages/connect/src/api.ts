// The façade an embedding app (e.g. OpenBooth) talks to.
//
// Design rule: a caller should never have to know about `GS v 0`, bytes-per-row, band
// limits, dithering or GATT characteristics. It picks a printer profile, hands over a
// receipt, and gets back something it can preview and something it can send.
import type { ReceiptDocument, ReceiptMetadata } from '@receipt-engine/core'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import type { ToBitmapOptions } from '@receipt-engine/bitmap'
import { receiptSvgToEscposWithMetadata } from './compose'
import { BleTransport } from './bluetooth'
import { GPRINTER_BLE_80, type PrinterProfile, type TransmissionModeName } from './profiles'
import type { PrinterState, Transport, TransportDiagnostics, WriteOptions } from './transport'

export interface RenderReceiptOptions {
  /** Printer to target. Defaults to the Gprinter 80mm BLE profile. */
  printer?: PrinterProfile
  /** Override the profile's paper width in dots (e.g. print a 58mm page on an 80mm unit). */
  dots?: number
  /** 1-bpp conversion knobs (threshold / dithering) when a print looks too dark or washed out. */
  bitmap?: ToBitmapOptions
}

export interface ReceiptResult {
  /** SVG string — safe to inject into the DOM for an on-screen preview. */
  preview: string
  /** Ready-to-send ESC/POS bytes for `Printer.print()`. */
  escposBytes: Uint8Array
  /** Physical size of the print: dots, mm, and receipts per roll. */
  metadata: ReceiptMetadata
}

/**
 * Render a receipt for a specific printer: preview + bytes + measurements in one call.
 *
 * Runs the real production path (native-width SVG → canvas raster → 1-bpp → ESC/POS), so
 * the preview and the bytes can never disagree. Browser-only: rasterizing needs a canvas.
 */
export async function renderReceipt(
  receipt: ReceiptDocument,
  options: RenderReceiptOptions = {},
): Promise<ReceiptResult> {
  const printer = options.printer ?? GPRINTER_BLE_80
  const paper = printer.paper
  const preview = renderReceiptToSvg(receipt, {
    theme: 'thermal',
    paper,
    // Thermal paper is already white; a page background would only burn ink.
    transparentBackground: true,
  })
  const { escposBytes, metadata } = await receiptSvgToEscposWithMetadata(preview, {
    printer,
    dots: options.dots ?? paper.printableWidthDots,
    bitmap: options.bitmap,
  })
  return { preview, escposBytes, metadata }
}

export interface PrinterOptions {
  /** Which printer to talk to. Defaults to the Gprinter 80mm BLE profile. */
  profile?: PrinterProfile
  /** Override the profile's BLE pacing. */
  mode?: TransmissionModeName
  /** Fired on every state change, for UI. */
  onStateChange?: (state: PrinterState) => void
}

/**
 * A connected printer. Thin by design: connect, print bytes, disconnect, ask its state.
 *
 * Writes are queued internally, so concurrent `print()` calls cannot interleave into a
 * garbled receipt, and a failed write rejects rather than silently reporting success.
 */
export class Printer {
  private readonly transport: BleTransport
  private readonly mode?: TransmissionModeName

  constructor(options: PrinterOptions = {}) {
    this.transport = new BleTransport(options.profile ?? GPRINTER_BLE_80)
    this.mode = options.mode
    if (options.onStateChange) this.transport.onStateChange = options.onStateChange
  }

  /** True when this browser has Web Bluetooth at all (Android Chrome yes, iOS Safari no). */
  static get supported(): boolean {
    return BleTransport.supported
  }

  /** Must be called from a user gesture — browsers only show the chooser on a real click. */
  connect(): Promise<void> {
    return this.transport.connect()
  }

  disconnect(): void {
    this.transport.disconnect()
  }

  /** Send ESC/POS bytes (from `renderReceipt().escposBytes`). Resolves when fully written. */
  print(bytes: Uint8Array, opts: WriteOptions = {}): Promise<void> {
    return this.transport.write(bytes, { mode: this.mode, ...opts })
  }

  getState(): PrinterState {
    return this.transport.state
  }

  /** Device name, service/characteristic UUIDs, write mode, byte counters. */
  getDiagnostics(): TransportDiagnostics {
    return this.transport.getDiagnostics()
  }

  /** Escape hatch for callers that need the raw Transport (tests, custom flows). */
  get raw(): Transport {
    return this.transport
  }
}
