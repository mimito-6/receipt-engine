import {
  normalizeReceipt,
  validateReceipt,
  type BlockKey,
  type ReceiptDocument,
} from '@receipt-engine/core'
import {
  getTheme,
  type ReceiptTheme,
  type ReceiptThemeName,
} from '@receipt-engine/themes'
import {
  renderBody,
  renderCustomBlock,
  renderEvent,
  renderFooterImage,
  renderLogo,
  renderMerchantName,
  renderMerchantSubtitle,
  renderMessageBody,
  renderMessageFooter,
  renderMessageTitle,
  renderQrCaption,
  renderQrImage,
  renderQrLabel,
  renderStickers,
  type StickerGeom,
} from './blocks'
import { isImageSource } from './assets'
import { escapeXml } from './escape'
import {
  createMoneyFormatter,
  createPainter,
  n,
  svgRect,
  type BlockResult,
  type RenderContext,
} from './layout'

export interface RenderSvgOptions {
  theme?: ReceiptThemeName | ReceiptTheme
  width?: number
  /** Top whitespace inside the card, in px. Defaults to 4× the side padding. */
  padTop?: number
  /** Bottom whitespace inside the card, in px. Defaults to 4× the side padding. */
  padBottom?: number
  /** Left/right padding inside the card, in px. Defaults to the theme's page spacing. */
  padX?: number
  /** Editor opt-in: tag blocks/text with data-re-block / data-re-id for hit-testing. */
  interactive?: boolean
  /** CSS injected as a <style> after <defs> — e.g. @font-face rules to embed fonts. */
  fontFaceCss?: string
  /** Force all embedded images B&W (true) or full colour (false). Overrides the
   *  theme default (thermal = mono, custom = colour) when set. */
  monochromeImages?: boolean
  /** Omit ONLY the page background (the desk behind the card). The card itself —
   *  its shape, surface colour, border, torn edges and background image — is kept,
   *  so a clean PNG is just the receipt card on a transparent backdrop, ready to print. */
  transparentBackground?: boolean
  /** Draw torn / perforated sawtooth top & bottom edges (the thermal-receipt look).
   *  Overrides the theme default. Rendered as the card silhouette, so it survives a
   *  transparent/clean export (becomes a torn outline) — a selectable "receipt-machine"
   *  layout for any theme. */
  perforatedEdges?: boolean
  /** Carried through for PNG rasterization; does not change SVG geometry. */
  pixelRatio?: number
  includeXmlDeclaration?: boolean
}

const DEFAULT_BLOCK_ORDER: BlockKey[] = [
  'logo',
  'name',
  'subtitle',
  'event',
  'body',
  'customBlocks',
  'qrImage',
  'qrLabel',
  'qrCaption',
  'messageTitle',
  'messageBody',
  'messageFooter',
  'footerImage',
]

// Expand legacy (coarse) block keys from older saved configs into the new
// fine-grained units, so previously-saved blockOrder values still work.
const LEGACY_BLOCK_ALIASES: Record<string, BlockKey[]> = {
  header: ['logo', 'name', 'subtitle'],
  transaction: ['body'],
  items: ['body'],
  discounts: ['body'],
  totals: ['body'],
  payments: ['body'],
  qr: ['qrImage', 'qrLabel', 'qrCaption'],
  message: ['messageTitle', 'messageBody', 'messageFooter'],
}

const DEFAULT_CARD_WIDTH = 720
const THERMAL_WIDTH = 384
const MONO_FILTER_ID = 're-mono'

function resolveTheme(option: RenderSvgOptions['theme']): ReceiptTheme {
  if (!option) return getTheme('custom')
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

/** Torn-receipt card silhouette: a closed path with sawtooth top & bottom edges and
 *  straight sides. The notches expose whatever is behind the card (the page bg, or
 *  transparency on a clean export), so the torn look reads with OR without paper fill. */
function tornCardPath(
  x0: number,
  width: number,
  top: number,
  height: number,
  tooth = 12,
  depth = 9,
): string {
  const bottom = top + height
  const count = Math.max(2, Math.floor(width / tooth))
  const w = width / count
  let d = `M${n(x0)} ${n(top)}`
  // top edge, left → right: valleys dip down into the paper
  for (let i = 0; i < count; i++) {
    const x = x0 + i * w
    d += `L${n(x + w / 2)} ${n(top + depth)}L${n(x + w)} ${n(top)}`
  }
  d += `L${n(x0 + width)} ${n(bottom)}` // right side
  // bottom edge, right → left: valleys rise up into the paper
  for (let i = 0; i < count; i++) {
    const x = x0 + width - i * w
    d += `L${n(x - w / 2)} ${n(bottom - depth)}L${n(x - w)} ${n(bottom)}`
  }
  return d + 'Z' // left side, back to start
}

/** Black & white image filter (luminance-weighted grayscale), resvg-supported. */
function monoFilter(id: string): string {
  return (
    `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>` +
    `</filter>`
  )
}

/** Render a validated, normalized receipt to a deterministic SVG string. */
export function renderReceiptToSvg(
  receipt: ReceiptDocument,
  options: RenderSvgOptions = {},
): string {
  const doc = normalizeReceipt(validateReceipt(receipt))
  const theme = resolveTheme(options.theme)
  const isThermal = theme.mode === 'thermal'
  const transparent = !!options.transparentBackground
  const monoImages = options.monochromeImages ?? theme.decoration?.monochromeImages ?? isThermal
  // The value used in `filter="…"`; the <defs> below uses the bare id.
  const monoFilterId = monoImages ? `url(#${MONO_FILTER_ID})` : undefined

  const width = options.width ?? (isThermal ? THERMAL_WIDTH : DEFAULT_CARD_WIDTH)
  const outerMargin = isThermal ? 22 : 26
  const innerPad = theme.spacing.page
  // Top & bottom whitespace inside the card. Default is 4× the side padding for a
  // roomy, receipt-like feed margin, but each edge is independently overridable
  // (so the UI can expose separate top/bottom sliders).
  const defaultVerticalPad = innerPad * 4
  const padTop = Math.max(0, options.padTop ?? defaultVerticalPad)
  const padBottom = Math.max(0, options.padBottom ?? defaultVerticalPad)
  const cardX = outerMargin
  const cardTop = outerMargin
  const sidePad = Math.max(8, options.padX ?? innerPad)
  const cardWidth = width - outerMargin * 2
  const contentLeft = cardX + sidePad
  const contentRight = cardX + cardWidth - sidePad
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
    monoFilterId,
    interactive: !!options.interactive,
    styleOverrides: doc.styleOverrides,
  }
  const p = createPainter(ctx)

  const parts: string[] = []
  const section = theme.spacing.section
  let y = cardTop + padTop

  // Place one block, advancing the cursor and (in interactive mode) wrapping it in
  // a <g data-re-block="…"> so the editor can hit-test/reorder it.
  const placeOne = (block: BlockResult, key: string): void => {
    if (block.height <= 0) return
    parts.push(options.interactive ? `<g data-re-block="${key}">${block.markup}</g>` : block.markup)
    y += block.height + section
  }

  const placeKey = (key: BlockKey): void => {
    switch (key) {
      case 'logo':
        placeOne(renderLogo(ctx, p, doc.merchant, y), 'logo')
        break
      case 'name':
        placeOne(renderMerchantName(ctx, p, doc.merchant, y), 'name')
        break
      case 'subtitle':
        placeOne(renderMerchantSubtitle(ctx, p, doc.merchant, y), 'subtitle')
        break
      case 'event':
        if (doc.event) placeOne(renderEvent(ctx, p, doc.event, y), 'event')
        break
      case 'body':
        placeOne(
          renderBody(
            ctx,
            p,
            {
              transaction: doc.transaction,
              items: doc.items,
              discounts: doc.discounts,
              totals: doc.totals,
              payments: doc.payments,
            },
            y,
          ),
          'body',
        )
        break
      case 'qrImage':
        if (doc.qr) placeOne(renderQrImage(ctx, p, doc.qr, y), 'qrImage')
        break
      case 'qrLabel':
        if (doc.qr) placeOne(renderQrLabel(ctx, p, doc.qr, y), 'qrLabel')
        break
      case 'qrCaption':
        if (doc.qr) placeOne(renderQrCaption(ctx, p, doc.qr, y), 'qrCaption')
        break
      case 'customBlocks':
        ;(doc.customBlocks ?? []).forEach((b, i) =>
          placeOne(renderCustomBlock(ctx, p, b, y), `customBlocks.${i}`),
        )
        break
      case 'messageTitle':
        if (doc.message) placeOne(renderMessageTitle(ctx, p, doc.message, y), 'messageTitle')
        break
      case 'messageBody':
        if (doc.message) placeOne(renderMessageBody(ctx, p, doc.message, y), 'messageBody')
        break
      case 'messageFooter':
        if (doc.message) placeOne(renderMessageFooter(ctx, p, doc.message, y), 'messageFooter')
        break
      case 'footerImage':
        if (doc.assets?.footerImage) {
          placeOne(renderFooterImage(ctx, p, doc.assets.footerImage, y), 'footerImage')
        }
        break
    }
  }

  // Honor a custom block order, but always include every unit (missing keys are
  // appended in default order so a partial blockOrder can't drop content).
  // Legacy coarse keys (header / items / qr / message …) expand to the new units.
  const requestedRaw =
    doc.blockOrder && doc.blockOrder.length > 0 ? doc.blockOrder : DEFAULT_BLOCK_ORDER
  const requested: BlockKey[] = []
  for (const k of requestedRaw) {
    const expanded = LEGACY_BLOCK_ALIASES[k]
    if (expanded) requested.push(...expanded)
    else requested.push(k)
  }
  const seen = new Set<BlockKey>()
  const order: BlockKey[] = []
  for (const k of requested) {
    if (!seen.has(k)) {
      seen.add(k)
      order.push(k)
    }
  }
  for (const k of DEFAULT_BLOCK_ORDER) if (!seen.has(k)) order.push(k)
  for (const key of order) placeKey(key)

  const lastContentBottom = y - section
  const cardBottom = lastContentBottom + padBottom
  const cardHeight = cardBottom - cardTop
  const totalHeight = Math.round(cardBottom + outerMargin)

  const borderStyle = theme.decoration?.borderStyle ?? 'solid'
  // "Receipt-machine" torn edges: a selectable layout. Defaults to the theme
  // (thermal = on, custom = off) but the caller can force it either way.
  const showEdges = options.perforatedEdges ?? theme.decoration?.perforatedEdges ?? false
  // Clean/transparent export drops ONLY the page background (the desk behind the
  // card). The card — shape, surface colour, border, torn edges, bg image — stays,
  // so a clean PNG is the receipt card floating on transparency.
  const background = transparent ? '' : svgRect(0, 0, width, totalHeight, { fill: theme.palette.background })
  const cardStroke = !isThermal && borderStyle !== 'none' ? theme.palette.border : undefined

  let card: string
  if (showEdges) {
    // Torn silhouette: notches expose whatever is behind the card (the page bg, or
    // transparency on a clean export). The card keeps its surface fill either way.
    card =
      `<path d="${tornCardPath(cardX, cardWidth, cardTop, cardHeight)}" ` +
      `fill="${escapeXml(theme.palette.surface)}"` +
      (cardStroke
        ? ` stroke="${escapeXml(cardStroke)}" stroke-width="1.5" stroke-linejoin="round"` +
          (borderStyle === 'dashed' ? ' stroke-dasharray="5 6"' : '')
        : '') +
      ' />'
  } else {
    card = svgRect(cardX, cardTop, cardWidth, cardHeight, {
      fill: theme.palette.surface,
      rx: theme.radius.card,
      stroke: cardStroke,
      strokeWidth: cardStroke ? 1.5 : undefined,
      dash: !isThermal && borderStyle === 'dashed' ? '5 6' : undefined,
    })
  }

  let decorations = ''
  if (theme.decoration?.showCornerStars) {
    const accent = theme.palette.accent ?? theme.palette.primary
    decorations =
      sparkle(cardX + 28, cardTop + 32, 7, accent) +
      sparkle(cardX + cardWidth - 32, cardTop + 50, 5, accent) +
      sparkle(cardX + cardWidth - 40, cardBottom - 38, 6, accent) +
      sparkle(cardX + 36, cardBottom - 30, 4, accent)
  }

  let stickerLayer = ''
  if (doc.stickers && doc.stickers.length > 0) {
    const geom: StickerGeom = {
      cardLeft: cardX,
      cardRight: cardX + cardWidth,
      cardTop,
      cardBottom,
      centerX: cardX + cardWidth / 2,
    }
    stickerLayer = renderStickers(ctx, p, doc.stickers, geom)
  }

  // Background image (clipped to the card; opacity / scale / offset adjustable).
  // Kept on a clean export too — it's part of the card, not the page background.
  const bgSrc = doc.assets?.backgroundImage
  let bgImage = ''
  let bgClip = ''
  if (bgSrc && isImageSource(bgSrc)) {
    const op = doc.assets?.backgroundOpacity ?? 1
    // Free transform: the user scales and pans the image however they like — no
    // forced "cover" floor, so it can shrink well below the card or zoom far past
    // it. The box is the card scaled by `scale`, centered then offset; "slice"
    // keeps the aspect ratio. A tiny floor avoids a degenerate zero-size box.
    const scale = Math.max(0.05, doc.assets?.backgroundScale ?? 1)
    const panX = doc.assets?.backgroundX ?? 0
    const panY = doc.assets?.backgroundY ?? 0
    const bgW = cardWidth * scale
    const bgH = cardHeight * scale
    const bgX = cardX + (cardWidth - bgW) / 2 + panX
    const bgY = cardTop + (cardHeight - bgH) / 2 + panY
    const filterAttr = monoFilterId ? ` filter="${monoFilterId}"` : ''
    bgClip =
      `<clipPath id="re-bg"><rect x="${n(cardX)}" y="${n(cardTop)}" width="${n(cardWidth)}" ` +
      `height="${n(cardHeight)}" rx="${n(theme.radius.card)}"/></clipPath>`
    bgImage =
      `<g clip-path="url(#re-bg)"><image href="${escapeXml(bgSrc)}" x="${n(bgX)}" y="${n(bgY)}" ` +
      `width="${n(bgW)}" height="${n(bgH)}" preserveAspectRatio="xMidYMid slice" opacity="${op}"${filterAttr} /></g>`
  }

  const defsInner = (monoImages ? monoFilter(MONO_FILTER_ID) : '') + bgClip
  const defs = defsInner ? `<defs>${defsInner}</defs>` : ''
  // Optional embedded @font-face CSS — lets a rasterizer (e.g. canvas PNG export)
  // use the intended fonts instead of falling back to a system font.
  const fontStyle = options.fontFaceCss ? `<style>${options.fontFaceCss}</style>` : ''
  const xmlDecl = options.includeXmlDeclaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ''
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
    `viewBox="0 0 ${width} ${totalHeight}" font-family="${escapeXml(theme.typography.fontFamily)}">`

  return (
    xmlDecl +
    open +
    defs +
    fontStyle +
    background +
    card +
    bgImage +
    decorations +
    parts.join('') +
    stickerLayer +
    '</svg>'
  )
}
