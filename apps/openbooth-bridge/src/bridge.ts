// The OpenBooth ⇄ receipt-engine bridge. Bundled to a single IIFE that exposes
// everything OpenBooth's receipt.js glue needs on `window.ReceiptBridge` —
// rendering, the OpenBooth order adapter, and the browser print/share delivery.
// Pure browser code (no Node APIs), so it runs on the phone OpenBooth runs on.
//
// The bridge is deliberately a thin re-export, but it is also the ONLY surface OpenBooth
// can see: anything not listed here is unreachable from the consumer, whatever the packages
// support. That is how the integration ended up pinned to 58mm — the paper profiles and the
// print façade existed for weeks without ever being exposed.
import { renderReceiptToSvg, renderReceiptWithMetadata } from '@receipt-engine/render-svg'
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import {
  PAPER_58,
  PAPER_80,
  bytesPerRow,
  dotsToMm,
  mmToDots,
  receiptMetadata,
  safeValidateReceipt,
} from '@receipt-engine/core'
import { applyTemplate, ensureValid, importOpenBoothOrder } from '@receipt-engine/import'
import {
  BleTransport,
  BluetoothThermalPrinter,
  GENERIC_BLE_58,
  GENERIC_BLE_80,
  GPRINTER_BLE_80,
  Printer,
  TRANSMISSION_MODES,
  buildFontFaceCss,
  canShareFiles,
  getPrinterProfile,
  getTransmissionMode,
  printReceiptSvg,
  receiptSvgToEscpos,
  receiptSvgToEscposWithMetadata,
  renderReceipt,
  shareReceiptSvg,
  svgToPngBlob,
} from '@receipt-engine/connect'

const ReceiptBridge = {
  // 0.2.0: 80mm/576-dot support, printer + paper profiles, the one-call print façade, and
  // receipt metadata (length in mm, receipts per roll). 0.1.x callers keep working — nothing
  // was removed, only added.
  version: '0.2.0',

  // ── rendering / themes
  renderReceiptToSvg,
  /** Same render, plus widthDots/heightDots/estimatedLengthMm/estimatedReceiptsPerRoll. */
  renderReceiptWithMetadata,
  renderReceiptToHtml,
  getTheme,
  mergeTheme,
  safeValidateReceipt,

  // ── paper geometry. 58mm is 384 dots, 80mm is 576 — the profile decides every downstream
  //    dimension, so a consumer never has to hardcode a dot count again.
  PAPER_58,
  PAPER_80,
  receiptMetadata,
  bytesPerRow,
  mmToDots,
  dotsToMm,

  // ── printer profiles: paper, pacing, whether a cutter exists, the measured write ceiling.
  GPRINTER_BLE_80,
  GENERIC_BLE_58,
  GENERIC_BLE_80,
  getPrinterProfile,
  TRANSMISSION_MODES,
  getTransmissionMode,

  // ── the simple path: one call from a receipt document to preview + bytes + metadata,
  //    and a printer object that owns its connection. Neither requires the caller to know
  //    anything about GS v 0, rasterization or 1-bit conversion.
  renderReceipt,
  Printer,

  // ── delivery (lower level; still exported for existing callers)
  BleTransport,
  BluetoothThermalPrinter,
  printReceiptSvg,
  receiptSvgToEscpos,
  receiptSvgToEscposWithMetadata,
  shareReceiptSvg,
  svgToPngBlob,
  canShareFiles,
  buildFontFaceCss,

  // ── order mapping
  importOpenBoothOrder,
  applyTemplate,
  ensureValid,
}

;(window as unknown as Record<string, unknown>).ReceiptBridge = ReceiptBridge

export default ReceiptBridge
