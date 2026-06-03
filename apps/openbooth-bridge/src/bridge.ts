// The OpenBooth ⇄ receipt-engine bridge. Bundled to a single IIFE that exposes
// everything OpenBooth's receipt.js glue needs on `window.ReceiptBridge` —
// rendering, the OpenBooth order adapter, and the browser print/share delivery.
// Pure browser code (no Node APIs), so it runs on the phone OpenBooth runs on.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { safeValidateReceipt } from '@receipt-engine/core'
import { applyTemplate, ensureValid, importOpenBoothOrder } from '@receipt-engine/import'
import {
  BluetoothThermalPrinter,
  canShareFiles,
  printReceiptSvg,
  receiptSvgToEscpos,
  shareReceiptSvg,
  svgToPngBlob,
} from '@receipt-engine/connect'

const ReceiptBridge = {
  version: '0.1.0',
  // rendering / themes
  renderReceiptToSvg,
  renderReceiptToHtml,
  getTheme,
  mergeTheme,
  safeValidateReceipt,
  // order mapping
  importOpenBoothOrder,
  applyTemplate,
  ensureValid,
  // delivery
  BluetoothThermalPrinter,
  printReceiptSvg,
  receiptSvgToEscpos,
  shareReceiptSvg,
  svgToPngBlob,
  canShareFiles,
}

;(window as unknown as Record<string, unknown>).ReceiptBridge = ReceiptBridge

export default ReceiptBridge
