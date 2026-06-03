import { ReceiptValidationError } from './errors'
import { ReceiptDocumentSchema, type ReceiptDocument } from './schema'

/** Validate `input` against the receipt schema, throwing `ReceiptValidationError` on failure. */
export function validateReceipt(input: unknown): ReceiptDocument {
  const result = ReceiptDocumentSchema.safeParse(input)
  if (!result.success) {
    throw ReceiptValidationError.fromZodError(result.error)
  }
  return result.data
}

export interface SafeValidateResult {
  success: boolean
  data?: ReceiptDocument
  error?: ReceiptValidationError
}

/** Non-throwing variant of {@link validateReceipt}. */
export function safeValidateReceipt(input: unknown): SafeValidateResult {
  const result = ReceiptDocumentSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: ReceiptValidationError.fromZodError(result.error) }
}

export { ReceiptValidationError } from './errors'
export type { ReceiptValidationIssue } from './errors'

export { calculateTotals, itemSubtotal, round2 } from './totals'

export { normalizeReceipt } from './normalize'
export type {
  NormalizedReceiptDocument,
  NormalizedReceiptItem,
  NormalizedReceiptTotals,
} from './normalize'

export {
  SCHEMA_VERSION,
  ReceiptDocumentSchema,
  MerchantSchema,
  EventSchema,
  TransactionSchema,
  ItemSchema,
  DiscountSchema,
  PaymentSchema,
  TotalsSchema,
  QrSchema,
  MessageSchema,
  AssetsSchema,
  CustomBlockSchema,
  StickerSchema,
  TextStyleSchema,
  BlockKeySchema,
  BLOCK_KEYS,
  SocialLinkSchema,
} from './schema'
export type {
  ReceiptDocument,
  ReceiptMerchant,
  ReceiptEvent,
  ReceiptTransaction,
  ReceiptItem,
  ReceiptDiscount,
  ReceiptPayment,
  ReceiptTotals,
  ReceiptQr,
  ReceiptMessage,
  ReceiptAssets,
  ReceiptCustomBlock,
  ReceiptSticker,
  TextStyle,
  BlockKey,
  ReceiptSocialLink,
} from './schema'
