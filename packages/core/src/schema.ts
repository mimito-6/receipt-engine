import { z } from 'zod'

/** The receipt schema version this build of receipt-engine understands. */
export const SCHEMA_VERSION = '0.1' as const

export const SocialLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
})

export const MerchantSchema = z.object({
  name: z.string().min(1, 'Merchant name is required'),
  subtitle: z.string().optional(),
  /** URL, data URI, or relative path. */
  logo: z.string().optional(),
  /** emoji, URL, data URI, or relative path. */
  icon: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  socials: z.array(SocialLinkSchema).optional(),
})

export const EventSchema = z.object({
  name: z.string().optional(),
  boothName: z.string().optional(),
  boothNumber: z.string().optional(),
  location: z.string().optional(),
  date: z.string().optional(),
})

export const TransactionSchema = z.object({
  receiptNo: z.string().min(1),
  /** ISO 8601 string. */
  issuedAt: z.string().min(1),
  cashier: z.string().optional(),
  note: z.string().optional(),
})

export const ItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  variant: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().positive('Expected number greater than 0'),
  unitPrice: z.number().min(0, 'Expected number greater than or equal to 0'),
  /** Optional; defaults to quantity * unitPrice when omitted. */
  subtotal: z.number().optional(),
  note: z.string().optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const DiscountSchema = z.object({
  label: z.string().min(1),
  /** Positive number; rendered as a negative line. */
  amount: z.number().positive('Expected number greater than 0'),
})

export const PaymentSchema = z.object({
  method: z.string().min(1),
  amount: z.number(),
  reference: z.string().optional(),
})

export const TotalsSchema = z.object({
  subtotal: z.number().optional(),
  discountTotal: z.number().optional(),
  taxTotal: z.number().optional(),
  serviceFee: z.number().optional(),
  total: z.number().optional(),
  paid: z.number().optional(),
  change: z.number().optional(),
})

export const QrSchema = z.object({
  value: z.string().min(1),
  label: z.string().optional(),
  caption: z.string().optional(),
})

export const MessageSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  footer: z.string().optional(),
})

export const AssetsSchema = z.object({
  footerImage: z.string().optional(),
  backgroundImage: z.string().optional(),
})

export const CustomBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
    align: z.enum(['left', 'center', 'right']).optional(),
  }),
  z.object({
    type: z.literal('image'),
    src: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({
    type: z.literal('divider'),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('qr'),
    value: z.string(),
    label: z.string().optional(),
    caption: z.string().optional(),
  }),
])

export const ReceiptDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().optional(),
  locale: z.string().optional(),
  currency: z.string().min(1),
  merchant: MerchantSchema,
  event: EventSchema.optional(),
  transaction: TransactionSchema,
  items: z.array(ItemSchema),
  discounts: z.array(DiscountSchema).optional(),
  payments: z.array(PaymentSchema).optional(),
  totals: TotalsSchema.optional(),
  qr: QrSchema.optional(),
  message: MessageSchema.optional(),
  assets: AssetsSchema.optional(),
  customBlocks: z.array(CustomBlockSchema).optional(),
})

export type ReceiptSocialLink = z.infer<typeof SocialLinkSchema>
export type ReceiptMerchant = z.infer<typeof MerchantSchema>
export type ReceiptEvent = z.infer<typeof EventSchema>
export type ReceiptTransaction = z.infer<typeof TransactionSchema>
export type ReceiptItem = z.infer<typeof ItemSchema>
export type ReceiptDiscount = z.infer<typeof DiscountSchema>
export type ReceiptPayment = z.infer<typeof PaymentSchema>
export type ReceiptTotals = z.infer<typeof TotalsSchema>
export type ReceiptQr = z.infer<typeof QrSchema>
export type ReceiptMessage = z.infer<typeof MessageSchema>
export type ReceiptAssets = z.infer<typeof AssetsSchema>
export type ReceiptCustomBlock = z.infer<typeof CustomBlockSchema>
export type ReceiptDocument = z.infer<typeof ReceiptDocumentSchema>
