import {
  normalizeReceipt,
  validateReceipt,
  type ReceiptDocument,
} from '@receipt-engine/core'
import {
  getTheme,
  type ReceiptTheme,
  type ReceiptThemeName,
} from '@receipt-engine/themes'
import {
  renderCustomBlock,
  renderDiscounts,
  renderEvent,
  renderFooterImage,
  renderHeader,
  renderItems,
  renderMessage,
  renderPayments,
  renderQrBlock,
  renderTotals,
  renderTransactionMeta,
} from './blocks'
import { escapeXml } from './escape'
import {
  createMoneyFormatter,
  createPainter,
  svgRect,
  type BlockResult,
  type RenderContext,
} from './layout'

export interface RenderSvgOptions {
  theme?: ReceiptThemeName | ReceiptTheme
  width?: number
  /** Carried through for PNG rasterization; does not change SVG geometry. */
  pixelRatio?: number
  includeXmlDeclaration?: boolean
}

const DEFAULT_CARD_WIDTH = 720
const THERMAL_WIDTH = 384

function resolveTheme(option: RenderSvgOptions['theme']): ReceiptTheme {
  if (!option) return getTheme('minimal')
  if (typeof option === 'string') return getTheme(option)
  return option
}

function sparkle(x: number, y: number, r: number, fill: string): string {
  const i = r * 0.28
  const d =
    `M${x} ${y - r}L${x + i} ${y - i}L${x + r} ${y}L${x + i} ${y + i}` +
    `L${x} ${y + r}L${x - i} ${y + i}L${x - r} ${y}L${x - i} ${y - i}Z`
  return `<path d="${d}" fill="${escapeXml(fill)}" opacity="0.85" />`
}

/** Render a validated, normalized receipt to a deterministic SVG string. */
export function renderReceiptToSvg(
  receipt: ReceiptDocument,
  options: RenderSvgOptions = {},
): string {
  const doc = normalizeReceipt(validateReceipt(receipt))
  const theme = resolveTheme(options.theme)
  const isThermal = theme.mode === 'thermal'

  const width = options.width ?? (isThermal ? THERMAL_WIDTH : DEFAULT_CARD_WIDTH)
  const outerMargin = isThermal ? 0 : 26
  const innerPad = theme.spacing.page
  const cardX = outerMargin
  const cardTop = outerMargin
  const cardWidth = width - outerMargin * 2
  const contentLeft = cardX + innerPad
  const contentRight = cardX + cardWidth - innerPad
  const contentWidth = contentRight - contentLeft

  const ctx: RenderContext = {
    theme,
    width,
    outerMargin,
    cardX,
    cardWidth,
    contentLeft,
    contentRight,
    contentWidth,
    mono: isThermal,
    currency: doc.currency,
    formatMoney: createMoneyFormatter(doc.currency),
  }
  const p = createPainter(ctx)

  const parts: string[] = []
  const section = theme.spacing.section
  let y = cardTop + innerPad

  const place = (block: BlockResult, gap = section): void => {
    if (block.height <= 0) return
    parts.push(block.markup)
    y += block.height + gap
  }

  place(renderHeader(ctx, p, doc.merchant, y))
  if (doc.event) place(renderEvent(ctx, p, doc.event, y))
  place(renderTransactionMeta(ctx, p, doc.transaction, y))
  place(renderItems(ctx, p, doc.items, y))
  if (doc.discounts && doc.discounts.length > 0) place(renderDiscounts(ctx, p, doc.discounts, y))
  place(renderTotals(ctx, p, doc.totals, y))
  if (doc.payments && doc.payments.length > 0) {
    place(renderPayments(ctx, p, doc.payments, doc.totals, y))
  }
  if (doc.qr) place(renderQrBlock(ctx, p, doc.qr, y))
  for (const block of doc.customBlocks ?? []) place(renderCustomBlock(ctx, p, block, y))
  if (doc.message) place(renderMessage(ctx, p, doc.message, y))
  if (doc.assets?.footerImage) place(renderFooterImage(ctx, p, doc.assets.footerImage, y))

  const lastContentBottom = y - section
  const cardBottom = lastContentBottom + innerPad
  const cardHeight = cardBottom - cardTop
  const totalHeight = Math.round(cardBottom + outerMargin)

  const borderStyle = theme.decoration?.borderStyle ?? 'solid'
  const background = svgRect(0, 0, width, totalHeight, { fill: theme.palette.background })
  const card = svgRect(cardX, cardTop, cardWidth, cardHeight, {
    fill: theme.palette.surface,
    rx: theme.radius.card,
    stroke: !isThermal && borderStyle !== 'none' ? theme.palette.border : undefined,
    strokeWidth: !isThermal && borderStyle !== 'none' ? 1.5 : undefined,
    dash: !isThermal && borderStyle === 'dashed' ? '5 6' : undefined,
  })

  let decorations = ''
  if (theme.decoration?.showCornerStars) {
    const accent = theme.palette.accent ?? theme.palette.primary
    decorations =
      sparkle(cardX + 28, cardTop + 32, 7, accent) +
      sparkle(cardX + cardWidth - 32, cardTop + 50, 5, accent) +
      sparkle(cardX + cardWidth - 40, cardBottom - 38, 6, accent) +
      sparkle(cardX + 36, cardBottom - 30, 4, accent)
  }

  const xmlDecl = options.includeXmlDeclaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ''
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
    `viewBox="0 0 ${width} ${totalHeight}" font-family="${escapeXml(theme.typography.fontFamily)}">`

  return xmlDecl + open + background + card + decorations + parts.join('') + '</svg>'
}
