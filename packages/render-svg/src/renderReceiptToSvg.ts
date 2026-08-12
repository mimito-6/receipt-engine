import {
  normalizeReceipt,
  receiptMetadata,
  validateReceipt,
  type BlockKey,
  type PaperProfile,
  type ReceiptDocument,
  type ReceiptMetadata,
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
  /**
   * Thermal paper profile (58mm/384 dots, 80mm/576 dots, …). When set, the receipt is
   * LAID OUT natively at `printableWidthDots` — the card margins, side padding, QR and
   * logo boxes all come from the profile, so an 80mm receipt is a genuine 576-dot
   * design rather than a 384-dot one scaled up (which would smear every raster edge).
   *
   * An explicit `width` still wins, so existing callers are unaffected.
   */
  paper?: PaperProfile
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
  /**
   * Ink multiplier for the background image only. 1 = untouched, higher = denser. Clamped
   * to [1, 8]; values below 1 are ignored because brightening pale artwork toward the paper
   * helps nothing on a two-tone printer.
   *
   * Anchored at WHITE, not black: L' = 255 - K(255 - L). Scaling luminance instead would
   * darken white, so an opaque photo's white areas would print as a solid black slab.
   * Anchoring at white keeps paper as paper and black as black, and deepens only the tones
   * in between — which is what "print the artwork stronger" has to mean on a medium with no
   * grey. Raising the artwork's opacity does the same job until opacity clamps at 1; this
   * carries on past that point so the control does not go dead half way along its travel.
   */
  backgroundInkBoost?: number
  /**
   * Crop the canvas to the card, dropping the outer margin.
   *
   * The margin exists so the card can read as an object sitting on a surface. Paper has no
   * surface behind it: there the margin is just blank roll, and on a fixed-width head it is
   * spent width — a 26px margin on a 720px design gives away 7% of every receipt and shrinks
   * the type by the same amount. This is a viewBox change only; nothing re-flows, so the
   * composition is identical to the design, just without the border of nothing.
   *
   * Anything the design places outside the card (stickers deliberately overhanging the edge)
   * is cropped with it — on paper the card edge IS the paper edge.
   */
  cropToCard?: boolean
  /**
   * Drop the card's outline stroke.
   *
   * The outline draws the card's edge against the surface behind it. Cropped to the card
   * there is no surface and no edge to draw — the stroke becomes two lines running the full
   * length of the receipt, sitting exactly where a thermal head prints least reliably. It is
   * also ruinous for transfer size: an inked pixel in every row means no row is ever blank,
   * which on a real receipt was the difference between 0 and 635 elidable rows — half the
   * bytes, and the difference between a smooth print and a stuttering one.
   */
  hideCardBorder?: boolean
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
const BG_INK_FILTER_ID = 're-bg-ink'

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
// Full precision, NOT the layout number formatter: rounding filter coefficients to 2
// decimals skews their sum (a 0.4 factor emitted a matrix summing to 0.41), so the caller
// would not get the factor it asked for.
const coef = (v: number): string => String(Number(v.toFixed(6)))

function wrapFilter(id: string, rows: string): string {
  return (
    `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="matrix" values="${rows}"/>` +
    `</filter>`
  )
}

function monoFilter(id: string): string {
  const row = `${coef(0.2126)} ${coef(0.7152)} ${coef(0.0722)} 0 0`
  return wrapFilter(id, `${row} ${row} ${row} 0 0 0 1 0`)
}

/**
 * Multiply INK rather than luminance: L' = 255 - K(255 - L), i.e. offset 1-K in the last
 * column. White is a fixed point, so bare paper stays bare however hard the artwork is
 * pushed, and black is already saturated. Alpha passes through untouched, so transparent
 * artwork stays transparent instead of turning into a grey box.
 *
 * Only desaturates when the caller actually asked for monochrome images — folding the
 * luminance matrix in unconditionally would silently strip the colour from a boosted
 * background on every other render path.
 */
function inkBoostFilter(id: string, boost: number, monochrome: boolean): string {
  const off = coef(1 - boost)
  if (monochrome) {
    const row = `${coef(0.2126 * boost)} ${coef(0.7152 * boost)} ${coef(0.0722 * boost)} 0 ${off}`
    return wrapFilter(id, `${row} ${row} ${row} 0 0 0 1 0`)
  }
  const k = coef(boost)
  return wrapFilter(
    id,
    `${k} 0 0 0 ${off} 0 ${k} 0 0 ${off} 0 0 ${k} 0 ${off} 0 0 0 1 0`,
  )
}

/** Internal renderer: produces the SVG plus the geometry callers need for metadata. */
function renderInternal(
  receipt: ReceiptDocument,
  options: RenderSvgOptions = {},
): { svg: string; widthDots: number; heightDots: number } {
  const doc = normalizeReceipt(validateReceipt(receipt))
  const theme = resolveTheme(options.theme)
  const isThermal = theme.mode === 'thermal'
  const transparent = !!options.transparentBackground
  const monoImages = options.monochromeImages ?? theme.decoration?.monochromeImages ?? isThermal
  // The value used in `filter="…"`; the <defs> below uses the bare id.
  const monoFilterId = monoImages ? `url(#${MONO_FILTER_ID})` : undefined

  // Paper profile (when given) drives the geometry; an explicit `width` still wins so
  // existing callers keep their exact output.
  const paper = options.paper
  const width = options.width ?? paper?.printableWidthDots ?? (isThermal ? THERMAL_WIDTH : DEFAULT_CARD_WIDTH)
  const outerMargin = paper?.outerMarginDots ?? (isThermal ? 22 : 26)
  const innerPad = paper?.sidePaddingDots ?? theme.spacing.page
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
    formatMoney: createMoneyFormatter(doc.currency, doc.currencySymbol),
    monoFilterId,
    interactive: !!options.interactive,
    styleOverrides: doc.styleOverrides,
    qrSize: paper?.qrSizeDots,
    logoMaxWidth: paper?.logoMaxWidthDots,
    logoMaxHeight: paper?.logoMaxHeightDots,
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
  // The card frame is always a SOLID hairline (never dashed) — borderStyle only styles
  // the inner divider lines. Thermal has no frame; a theme with borderStyle 'none' opts out.
  const cardStroke =
    !isThermal && borderStyle !== 'none' && !options.hideCardBorder ? theme.palette.border : undefined

  let card: string
  if (showEdges) {
    // Torn silhouette: notches expose whatever is behind the card (the page bg, or
    // transparency on a clean export). The card keeps its surface fill either way.
    card =
      `<path d="${tornCardPath(cardX, cardWidth, cardTop, cardHeight)}" ` +
      `fill="${escapeXml(theme.palette.surface)}"` +
      (cardStroke ? ` stroke="${escapeXml(cardStroke)}" stroke-width="1.5" stroke-linejoin="round"` : '') +
      ' />'
  } else {
    card = svgRect(cardX, cardTop, cardWidth, cardHeight, {
      fill: theme.palette.surface,
      rx: theme.radius.card,
      stroke: cardStroke,
      strokeWidth: cardStroke ? 1.5 : undefined,
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
  // Only ever darkens, and capped: past ~8x even near-white artwork goes solid, which is a
  // black slab rather than a stronger design.
  const bgInkBoost = Math.min(8, Math.max(1, options.backgroundInkBoost ?? 1))
  // The background gets its own filter when it is being boosted, so pushing the artwork
  // cannot drag the logo and stickers down with it.
  const bgFilterId = bgInkBoost > 1 ? `url(#${BG_INK_FILTER_ID})` : monoFilterId
  const bgSrc = doc.assets?.backgroundImage
  let bgImage = ''
  let bgClip = ''
  if (bgSrc && isImageSource(bgSrc)) {
    const op = doc.assets?.backgroundOpacity ?? 1
    // ONE continuous model — no cover/contain mode switch (the switch made the size
    // JUMP when crossing 100%). The image keeps its aspect ratio ("meet") and scales
    // smoothly with `scale`: the placement box is the card scaled by `scale`, so width
    // tracks scale linearly. Small → a small whole image on the card; scale up → it
    // grows and, once it exceeds the card in both dimensions, fills it (clipped to the
    // card). Centered, then panned. Floor 0.05, no upper cap.
    const scale = Math.max(0.05, doc.assets?.backgroundScale ?? 1)
    const panX = doc.assets?.backgroundX ?? 0
    const panY = doc.assets?.backgroundY ?? 0
    const rot = doc.assets?.backgroundRotation ?? 0
    const bgW = cardWidth * scale
    const bgH = cardHeight * scale
    const bgX = cardX + (cardWidth - bgW) / 2 + panX
    const bgY = cardTop + (cardHeight - bgH) / 2 + panY
    const filterAttr = bgFilterId ? ` filter="${bgFilterId}"` : ''
    // Rotate around the image's (box) centre; the card clip still trims the result.
    const rotAttr = rot ? ` transform="rotate(${n(rot)} ${n(bgX + bgW / 2)} ${n(bgY + bgH / 2)})"` : ''
    bgClip =
      `<clipPath id="re-bg"><rect x="${n(cardX)}" y="${n(cardTop)}" width="${n(cardWidth)}" ` +
      `height="${n(cardHeight)}" rx="${n(theme.radius.card)}"/></clipPath>`
    bgImage =
      `<g clip-path="url(#re-bg)"><image href="${escapeXml(bgSrc)}" xlink:href="${escapeXml(bgSrc)}" ` +
      `x="${n(bgX)}" y="${n(bgY)}" ` +
      `width="${n(bgW)}" height="${n(bgH)}" preserveAspectRatio="xMidYMid meet" opacity="${op}"${rotAttr}${filterAttr} /></g>`
  }

  const defsInner =
    (monoImages ? monoFilter(MONO_FILTER_ID) : '') +
    (bgInkBoost > 1 ? inkBoostFilter(BG_INK_FILTER_ID, bgInkBoost, monoImages) : '') +
    bgClip
  const defs = defsInner ? `<defs>${defsInner}</defs>` : ''
  // Optional embedded @font-face CSS — lets a rasterizer (e.g. canvas PNG export)
  // use the intended fonts instead of falling back to a system font.
  const fontStyle = options.fontFaceCss ? `<style>${options.fontFaceCss}</style>` : ''
  const xmlDecl = options.includeXmlDeclaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ''
  // Crop is expressed purely as a viewBox window over the same coordinates, so every element
  // keeps the position the design gave it.
  const crop = options.cropToCard
    ? { x: cardX, y: cardTop, w: cardWidth, h: cardHeight }
    : { x: 0, y: 0, w: width, h: totalHeight }
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${n(crop.w)}" height="${n(crop.h)}" ` +
    `viewBox="${n(crop.x)} ${n(crop.y)} ${n(crop.w)} ${n(crop.h)}" ` +
    `font-family="${escapeXml(theme.typography.fontFamily)}">`

  const svg =
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

  return { svg, widthDots: Math.round(crop.w), heightDots: Math.round(crop.h) }
}

/** Render a validated, normalized receipt to a deterministic SVG string. */
export function renderReceiptToSvg(
  receipt: ReceiptDocument,
  options: RenderSvgOptions = {},
): string {
  return renderInternal(receipt, options).svg
}

/** An SVG plus the physical measurements of the receipt it describes. */
export interface RenderedReceipt {
  svg: string
  metadata: ReceiptMetadata
}

/**
 * Render a receipt AND report its physical size: dots, mm, and how many fit on a
 * roll. Callers driving a thermal printer need the dot dimensions anyway (to size the
 * raster), and the mm/roll figures let a UI say "this receipt is 12cm of paper"
 * without re-deriving the maths.
 *
 * The feed distance and DPI come from `options.paper` when present, so the length
 * estimate accounts for the blank paper advanced after printing.
 */
export function renderReceiptWithMetadata(
  receipt: ReceiptDocument,
  options: RenderSvgOptions = {},
): RenderedReceipt {
  const { svg, widthDots, heightDots } = renderInternal(receipt, options)
  return {
    svg,
    metadata: receiptMetadata({
      widthDots,
      heightDots,
      dpi: options.paper?.dpi,
      feedAfterPrintMm: options.paper?.feedAfterPrintMm,
    }),
  }
}
