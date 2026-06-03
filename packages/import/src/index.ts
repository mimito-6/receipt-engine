// @receipt-engine/import — the single POS contract boundary. Turn external order
// JSON (generic or OpenBooth) into a validated receipt-engine ReceiptDocument,
// optionally overlaid with a saved design template.
export { importOrder } from './generic'
export type { LooseOrder, LooseLineItem, LoosePayment } from './generic'

export { importOpenBoothOrder, epochToLocalIso } from './openbooth'
export type {
  OpenBoothTx,
  OpenBoothTxLine,
  OpenBoothSettings,
  OpenBoothEvent,
  ImportOpenBoothOptions,
} from './openbooth'

export { applyTemplate } from './template'
export type { ReceiptTemplate } from './template'

import type { ReceiptDocument } from '@receipt-engine/core'
import { safeValidateReceipt } from '@receipt-engine/core'

/** Validate an imported document, returning the typed receipt or throwing a clear error. */
export function ensureValid(doc: ReceiptDocument): ReceiptDocument {
  const res = safeValidateReceipt(doc)
  if (!res.success) {
    throw new Error('Imported order is not a valid receipt:\n' + (res.error?.format() ?? ''))
  }
  return res.data as ReceiptDocument
}
