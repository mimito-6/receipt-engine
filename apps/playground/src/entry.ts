// Browser entry: bundled to an IIFE global `ReceiptEngine`.
// Everything here is pure JS (no Node APIs), so it runs in any browser — phones included.
export { renderReceiptToSvg } from '@receipt-engine/render-svg'
export { renderReceiptToHtml } from '@receipt-engine/render-html'
export { getTheme, mergeTheme } from '@receipt-engine/themes'
export { safeValidateReceipt } from '@receipt-engine/core'
