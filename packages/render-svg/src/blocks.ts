import type {
  NormalizedReceiptItem,
  NormalizedReceiptTotals,
  ReceiptCustomBlock,
  ReceiptDiscount,
  ReceiptEvent,
  ReceiptMerchant,
  ReceiptMessage,
  ReceiptPayment,
  ReceiptQr,
  ReceiptSticker,
  ReceiptTransaction,
} from '@receipt-engine/core'
import { isImageSource } from './assets'
import {
  lineHeight,
  measureWidth,
  n,
  wrapText,
  type BlockResult,
  type Painter,
  type RenderContext,
  type TextOptions,
} from './layout'
import { renderQrGroup } from './qr'

const EMPTY: BlockResult = { markup: '', height: 0 }

function centerX(ctx: RenderContext): number {
  return (ctx.contentLeft + ctx.contentRight) / 2
}

function dashFor(ctx: RenderContext): string | undefined {
  const style = ctx.theme.decoration?.borderStyle ?? 'solid'
  return style === 'dashed' ? '4 5' : undefined
}

function divider(ctx: RenderContext, p: Painter, y: number, opacity = 1): string {
  if ((ctx.theme.decoration?.borderStyle ?? 'solid') === 'none') return ''
  return p.line(ctx.contentLeft, y, ctx.contentRight, y, {
    stroke: ctx.theme.palette.border,
    strokeWidth: 1,
    dash: dashFor(ctx),
    opacity,
  })
}

/** Wrap markup in the mono (grayscale) filter when the theme demands it — e.g. to
 *  desaturate color emoji on thermal. Images already get the filter via the painter. */
function monoWrap(ctx: RenderContext, inner: string): string {
  return ctx.monoFilterId ? `<g filter="${ctx.monoFilterId}">${inner}</g>` : inner
}

/**
 * Thermal-only dotted leader between a left label and a right value
 * (the classic "Label .......... Value" receipt look). No-op for card themes.
 */
function dottedLeader(
  ctx: RenderContext,
  p: Painter,
  label: string,
  value: string,
  baselineY: number,
  size: number,
): string {
  if (!ctx.mono) return ''
  const x1 = ctx.contentLeft + measureWidth(label, size, true) + 6
  const x2 = ctx.contentRight - measureWidth(value, size, true) - 6
  if (x2 - x1 < 14) return ''
  return p.line(x1, baselineY - size * 0.28, x2, baselineY - size * 0.28, {
    stroke: ctx.theme.palette.mutedText,
    strokeWidth: 1,
    dash: '1 4',
    opacity: 0.75,
  })
}

/** Render a stack of pre-wrapped lines from `startY`, returning markup + height. */
function textLines(
  p: Painter,
  lines: string[],
  x: number,
  startY: number,
  size: number,
  options: TextOptions = {},
): BlockResult {
  const lh = lineHeight(size)
  let cy = startY
  let markup = ''
  for (const line of lines) {
    markup += p.text(line, x, cy + size, { size, ...options })
    cy += lh
  }
  return { markup, height: cy - startY }
}

// ---------------------------------------------------------------------------
// Header / merchant
// ---------------------------------------------------------------------------

export function renderHeader(
  ctx: RenderContext,
  p: Painter,
  merchant: ReceiptMerchant,
  y: number,
): BlockResult {
  const { theme } = ctx
  const cx = centerX(ctx)
  let cursor = y
  let markup = ''

  if (merchant.logo && isImageSource(merchant.logo)) {
    const w = Math.min(160, ctx.contentWidth * 0.5)
    const h = 76
    markup += p.image(merchant.logo, cx - w / 2, cursor, w, h)
    cursor += h + 14
  } else if (merchant.icon) {
    if (isImageSource(merchant.icon)) {
      const s = 64
      markup += p.image(merchant.icon, cx - s / 2, cursor, s, s)
      cursor += s + 12
    } else {
      const size = 46
      markup += monoWrap(ctx, p.text(merchant.icon, cx, cursor + size, { size, anchor: 'middle' }))
      cursor += size + 12
    }
  }

  const titleSize = theme.typography.titleSize
  const nameLines = wrapText(merchant.name, ctx.contentWidth, titleSize, ctx.mono)
  const name = textLines(p, nameLines, cx, cursor, titleSize, {
    anchor: 'middle',
    weight: 700,
    fill: theme.palette.primary,
  })
  markup += name.markup
  cursor += name.height

  if (merchant.subtitle) {
    cursor += 2
    const sub = textLines(
      p,
      wrapText(merchant.subtitle, ctx.contentWidth, theme.typography.bodySize, ctx.mono),
      cx,
      cursor,
      theme.typography.bodySize,
      { anchor: 'middle', fill: theme.palette.secondary },
    )
    markup += sub.markup
    cursor += sub.height
  }

  const tagline = [merchant.website, ...(merchant.socials ?? []).map((s) => s.label)]
    .filter(Boolean)
    .join('  ·  ')
  if (tagline) {
    cursor += 2
    const line = textLines(p, [tagline], cx, cursor, theme.typography.smallSize, {
      anchor: 'middle',
      fill: theme.palette.mutedText,
    })
    markup += line.markup
    cursor += line.height
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export function renderEvent(
  ctx: RenderContext,
  p: Painter,
  event: ReceiptEvent,
  y: number,
): BlockResult {
  const { theme } = ctx
  const cx = centerX(ctx)
  const booth =
    event.boothNumber !== undefined ? `Booth ${event.boothNumber}` : (event.boothName ?? '')
  const primary = [event.name, booth].filter(Boolean).join('  ·  ')
  const secondary = [event.location, event.date].filter(Boolean).join('  ·  ')
  if (!primary && !secondary) return EMPTY

  let cursor = y
  let markup = ''
  const size = theme.typography.bodySize

  if (primary) {
    if (theme.mode === 'card') {
      const textW = measureWidth(primary, size, ctx.mono)
      const padX = 16
      const pillW = Math.min(ctx.contentWidth, textW + padX * 2)
      const pillH = size + 14
      markup += p.rect(cx - pillW / 2, cursor, pillW, pillH, {
        rx: pillH / 2,
        fill: theme.palette.primary,
        opacity: 0.08,
      })
      markup += p.text(primary, cx, cursor + pillH - 9, {
        size,
        anchor: 'middle',
        weight: 600,
        fill: theme.palette.primary,
      })
      cursor += pillH
    } else {
      markup += p.text(primary, cx, cursor + size, {
        size,
        anchor: 'middle',
        weight: 700,
        fill: theme.palette.text,
      })
      cursor += lineHeight(size)
    }
  }

  if (secondary) {
    cursor += 4
    const line = textLines(p, [secondary], cx, cursor, theme.typography.smallSize, {
      anchor: 'middle',
      fill: theme.palette.mutedText,
    })
    markup += line.markup
    cursor += line.height
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Transaction metadata
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso)
  return match ? `${match[1]} ${match[2]}` : iso
}

export function renderTransactionMeta(
  ctx: RenderContext,
  p: Painter,
  tx: ReceiptTransaction,
  y: number,
): BlockResult {
  const { theme } = ctx
  const size = theme.typography.smallSize
  const fill = theme.palette.mutedText
  let cursor = y
  let markup = ''

  markup += p.text(`#${tx.receiptNo}`, ctx.contentLeft, cursor + size, { size, fill })
  markup += p.text(formatDateTime(tx.issuedAt), ctx.contentRight, cursor + size, {
    size,
    fill,
    anchor: 'end',
  })
  cursor += lineHeight(size)

  if (tx.cashier) {
    markup += p.text(`Cashier: ${tx.cashier}`, ctx.contentLeft, cursor + size, { size, fill })
    cursor += lineHeight(size)
  }
  if (tx.note) {
    const lines = wrapText(tx.note, ctx.contentWidth, size, ctx.mono)
    const block = textLines(p, lines, ctx.contentLeft, cursor, size, { fill, italic: true })
    markup += block.markup
    cursor += block.height
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function renderItems(
  ctx: RenderContext,
  p: Painter,
  items: NormalizedReceiptItem[],
  y: number,
): BlockResult {
  const { theme } = ctx
  const body = theme.typography.bodySize
  const small = theme.typography.smallSize
  const showBadges = theme.decoration?.showItemBadges ?? false
  let cursor = y
  let markup = ''

  markup += divider(ctx, p, cursor, 0.8)
  cursor += 14

  items.forEach((item, index) => {
    const priceText = ctx.formatMoney(item.subtotal)
    const priceW = measureWidth(priceText, body, ctx.mono)
    const nameMaxWidth = Math.max(40, ctx.contentWidth - priceW - 18)
    const nameLines = wrapText(item.name, nameMaxWidth, body, ctx.mono)

    const firstBaseline = cursor + body
    nameLines.forEach((line, i) => {
      markup += p.text(line, ctx.contentLeft, cursor + body + i * lineHeight(body), {
        size: body,
        weight: 500,
        fill: theme.palette.text,
      })
    })
    markup += p.text(priceText, ctx.contentRight, firstBaseline, {
      size: body,
      weight: 600,
      anchor: 'end',
      fill: theme.palette.text,
    })
    cursor += nameLines.length * lineHeight(body)

    const subParts = [`${item.quantity} × ${ctx.formatMoney(item.unitPrice)}`]
    if (item.variant) subParts.push(item.variant)
    const subLine = subParts.join('  ·  ')
    markup += p.text(subLine, ctx.contentLeft, cursor + small, {
      size: small,
      fill: theme.palette.mutedText,
    })
    cursor += lineHeight(small)

    if (item.note) {
      const noteLines = wrapText(item.note, ctx.contentWidth, small, ctx.mono)
      const block = textLines(p, noteLines, ctx.contentLeft, cursor, small, {
        fill: theme.palette.mutedText,
        italic: true,
      })
      markup += block.markup
      cursor += block.height
    }

    if (showBadges && item.tags && item.tags.length > 0) {
      cursor += 4
      const badgeH = small + 8
      const fill = theme.palette.accent ?? theme.palette.primary
      let bx = ctx.contentLeft
      let by = cursor
      for (const tag of item.tags) {
        const tw = measureWidth(tag, small, ctx.mono) + 16
        if (bx + tw > ctx.contentRight) {
          bx = ctx.contentLeft
          by += badgeH + 5
        }
        markup += p.rect(bx, by, tw, badgeH, { rx: badgeH / 2, fill, opacity: 0.18 })
        markup += p.text(tag, bx + tw / 2, by + badgeH - 7, {
          size: small,
          anchor: 'middle',
          weight: 600,
          fill: theme.palette.primary,
        })
        bx += tw + 6
      }
      cursor = by + badgeH
    }

    cursor += theme.spacing.row
    if (index < items.length - 1) {
      markup += divider(ctx, p, cursor - theme.spacing.row / 2, 0.4)
    }
  })

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export function renderDiscounts(
  ctx: RenderContext,
  p: Painter,
  discounts: ReceiptDiscount[],
  y: number,
): BlockResult {
  if (discounts.length === 0) return EMPTY
  const { theme } = ctx
  const size = theme.typography.bodySize
  const fill = theme.palette.secondary
  let cursor = y
  let markup = ''
  for (const discount of discounts) {
    const value = `-${ctx.formatMoney(discount.amount)}`
    markup += dottedLeader(ctx, p, discount.label, value, cursor + size, size)
    markup += p.text(discount.label, ctx.contentLeft, cursor + size, { size, fill })
    markup += p.text(value, ctx.contentRight, cursor + size, { size, anchor: 'end', fill })
    cursor += lineHeight(size)
  }
  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export function renderTotals(
  ctx: RenderContext,
  p: Painter,
  totals: NormalizedReceiptTotals,
  y: number,
): BlockResult {
  const { theme } = ctx
  const size = theme.typography.bodySize
  let cursor = y
  let markup = ''

  markup += divider(ctx, p, cursor)
  cursor += 14

  const row = (label: string, value: string, muted = true) => {
    markup += dottedLeader(ctx, p, label, value, cursor + size, size)
    markup += p.text(label, ctx.contentLeft, cursor + size, {
      size,
      fill: muted ? theme.palette.mutedText : theme.palette.text,
    })
    markup += p.text(value, ctx.contentRight, cursor + size, {
      size,
      anchor: 'end',
      fill: muted ? theme.palette.mutedText : theme.palette.text,
    })
    cursor += lineHeight(size)
  }

  row('Subtotal', ctx.formatMoney(totals.subtotal))
  if (totals.discountTotal > 0) row('Discount', `-${ctx.formatMoney(totals.discountTotal)}`)
  if (totals.taxTotal > 0) row('Tax', ctx.formatMoney(totals.taxTotal))
  if (totals.serviceFee > 0) row('Service', ctx.formatMoney(totals.serviceFee))

  cursor += 6
  const totalSize = size + 4
  markup += dottedLeader(ctx, p, 'Total', ctx.formatMoney(totals.total), cursor + totalSize, totalSize)
  markup += p.text('Total', ctx.contentLeft, cursor + totalSize, {
    size: totalSize,
    weight: 700,
    fill: theme.palette.primary,
  })
  markup += p.text(ctx.formatMoney(totals.total), ctx.contentRight, cursor + totalSize, {
    size: totalSize,
    weight: 700,
    anchor: 'end',
    fill: theme.palette.primary,
  })
  cursor += lineHeight(totalSize)

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function renderPayments(
  ctx: RenderContext,
  p: Painter,
  payments: ReceiptPayment[],
  totals: NormalizedReceiptTotals,
  y: number,
): BlockResult {
  if (payments.length === 0) return EMPTY
  const { theme } = ctx
  const size = theme.typography.bodySize
  const small = theme.typography.smallSize
  let cursor = y
  let markup = ''

  for (const payment of payments) {
    const value = ctx.formatMoney(payment.amount)
    markup += dottedLeader(ctx, p, payment.method, value, cursor + size, size)
    markup += p.text(payment.method, ctx.contentLeft, cursor + size, {
      size,
      fill: theme.palette.text,
    })
    markup += p.text(value, ctx.contentRight, cursor + size, {
      size,
      anchor: 'end',
      fill: theme.palette.text,
    })
    cursor += lineHeight(size)
    if (payment.reference) {
      markup += p.text(payment.reference, ctx.contentLeft, cursor + small, {
        size: small,
        fill: theme.palette.mutedText,
      })
      cursor += lineHeight(small)
    }
  }

  if (Math.abs(totals.change) > 0.0001) {
    markup += dottedLeader(ctx, p, 'Change', ctx.formatMoney(totals.change), cursor + size, size)
    markup += p.text('Change', ctx.contentLeft, cursor + size, {
      size,
      weight: 600,
      fill: theme.palette.text,
    })
    markup += p.text(ctx.formatMoney(totals.change), ctx.contentRight, cursor + size, {
      size,
      weight: 600,
      anchor: 'end',
      fill: theme.palette.text,
    })
    cursor += lineHeight(size)
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

export function renderQrBlock(
  ctx: RenderContext,
  p: Painter,
  qr: ReceiptQr,
  y: number,
): BlockResult {
  const { theme } = ctx
  const cx = centerX(ctx)
  const size = theme.mode === 'thermal' ? 120 : 132
  let cursor = y
  let markup = ''

  markup += renderQrGroup(qr.value, {
    size,
    x: cx - size / 2,
    y: cursor,
    dark: theme.palette.text,
    light: '#ffffff',
  })
  cursor += size + 8

  if (qr.label) {
    markup += p.text(qr.label, cx, cursor + theme.typography.bodySize, {
      size: theme.typography.bodySize,
      anchor: 'middle',
      weight: 600,
      fill: theme.palette.primary,
    })
    cursor += lineHeight(theme.typography.bodySize)
  }
  if (qr.caption) {
    const lines = wrapText(qr.caption, ctx.contentWidth, theme.typography.smallSize, ctx.mono)
    const block = textLines(p, lines, cx, cursor, theme.typography.smallSize, {
      anchor: 'middle',
      fill: theme.palette.mutedText,
    })
    markup += block.markup
    cursor += block.height
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Custom blocks
// ---------------------------------------------------------------------------

export function renderCustomBlock(
  ctx: RenderContext,
  p: Painter,
  block: ReceiptCustomBlock,
  y: number,
): BlockResult {
  const { theme } = ctx
  const cx = centerX(ctx)

  if (block.type === 'text') {
    const size = theme.typography.bodySize
    const align = block.align ?? 'center'
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
    const x = align === 'left' ? ctx.contentLeft : align === 'right' ? ctx.contentRight : cx
    return textLines(p, wrapText(block.text, ctx.contentWidth, size, ctx.mono), x, y, size, {
      anchor,
      fill: theme.palette.text,
    })
  }

  if (block.type === 'image') {
    if (!isImageSource(block.src)) return EMPTY
    const w = block.width ?? Math.min(220, ctx.contentWidth * 0.7)
    const h = block.height ?? w
    return { markup: p.image(block.src, cx - w / 2, y, w, h), height: h }
  }

  if (block.type === 'divider') {
    const line = divider(ctx, p, y + 8)
    let markup = line
    if (block.label) {
      const size = theme.typography.smallSize
      const labelW = measureWidth(block.label, size, ctx.mono) + 16
      markup += p.rect(cx - labelW / 2, y, labelW, size + 8, { fill: theme.palette.surface })
      markup += p.text(block.label, cx, y + size + 1, {
        size,
        anchor: 'middle',
        fill: theme.palette.mutedText,
      })
    }
    return { markup, height: 16 }
  }

  // block.type === 'qr'
  return renderQrBlock(ctx, p, block, y)
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export function renderMessage(
  ctx: RenderContext,
  p: Painter,
  message: ReceiptMessage,
  y: number,
): BlockResult {
  const { theme } = ctx
  const cx = centerX(ctx)
  let cursor = y
  let markup = ''

  if (message.title) {
    const size = theme.typography.bodySize + 2
    markup += p.text(message.title, cx, cursor + size, {
      size,
      anchor: 'middle',
      weight: 700,
      fill: theme.palette.primary,
    })
    cursor += lineHeight(size) + 2
  }
  if (message.body) {
    const size = theme.typography.bodySize
    const block = textLines(
      p,
      wrapText(message.body, ctx.contentWidth, size, ctx.mono),
      cx,
      cursor,
      size,
      { anchor: 'middle', fill: theme.palette.text },
    )
    markup += block.markup
    cursor += block.height
  }
  if (message.footer) {
    cursor += 2
    const size = theme.typography.smallSize
    const block = textLines(
      p,
      wrapText(message.footer, ctx.contentWidth, size, ctx.mono),
      cx,
      cursor,
      size,
      { anchor: 'middle', fill: theme.palette.mutedText },
    )
    markup += block.markup
    cursor += block.height
  }

  return { markup, height: cursor - y }
}

// ---------------------------------------------------------------------------
// Footer image
// ---------------------------------------------------------------------------

export function renderFooterImage(
  ctx: RenderContext,
  p: Painter,
  src: string,
  y: number,
): BlockResult {
  if (!isImageSource(src)) return EMPTY
  const cx = centerX(ctx)
  const w = Math.min(ctx.contentWidth, 260)
  const h = 84
  return { markup: p.image(src, cx - w / 2, y, w, h), height: h }
}

// ---------------------------------------------------------------------------
// Stickers (free-floating overlay, rendered last)
// ---------------------------------------------------------------------------

export interface StickerGeom {
  cardLeft: number
  cardRight: number
  cardTop: number
  cardBottom: number
  centerX: number
}

/**
 * Draw stickers on top of everything. Each sticker is an emoji (text) or an
 * image, positioned by `anchor` + (x, y) offset, optionally rotated. Images go
 * black & white on thermal (via the painter's mono filter). Overlay only — does
 * not participate in the layout flow.
 */
export function renderStickers(
  ctx: RenderContext,
  p: Painter,
  stickers: ReceiptSticker[],
  geom: StickerGeom,
): string {
  let out = ''
  for (const sticker of stickers) {
    const isImage = isImageSource(sticker.content)
    const size = sticker.size ?? (isImage ? 56 : 38)

    let baseX = geom.cardRight - 44
    let baseY = geom.cardTop + 52
    switch (sticker.anchor) {
      case 'header':
        baseX = geom.centerX
        baseY = geom.cardTop + 40
        break
      case 'logo':
        baseX = geom.centerX
        baseY = geom.cardTop + 76
        break
      case 'footer':
        baseX = geom.centerX
        baseY = geom.cardBottom - 40
        break
      // 'free' (default): top-right corner
    }
    const cx = baseX + (sticker.x ?? 0)
    const cy = baseY + (sticker.y ?? 0)
    const rotate = sticker.rotation
      ? ` transform="rotate(${n(sticker.rotation)} ${n(cx)} ${n(cy)})"`
      : ''

    const inner = isImage
      ? p.image(sticker.content, cx - size / 2, cy - size / 2, size, size)
      : monoWrap(ctx, p.text(sticker.content, cx, cy + size * 0.34, { size, anchor: 'middle' }))

    out += `<g${rotate}>${inner}</g>`
  }
  return out
}
