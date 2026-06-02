import type { TextStyle } from '@receipt-engine/core'
import type { ReceiptTheme } from '@receipt-engine/themes'
import { svgImage } from './assets'
import { escapeXml } from './escape'

/** Shared geometry and helpers passed to every block builder. */
export interface RenderContext {
  theme: ReceiptTheme
  width: number
  outerMargin: number
  cardX: number
  cardWidth: number
  contentLeft: number
  contentRight: number
  contentWidth: number
  mono: boolean
  currency: string
  formatMoney: (amount: number) => string
  /** When set (thermal), every image is rendered through this filter, e.g. "url(#re-mono)". */
  monoFilterId?: string
  /** Editor opt-in: tag elements with data-re-id / data-re-block for hit-testing. */
  interactive?: boolean
  /** Per-element style overrides, keyed by element id. */
  styleOverrides?: Record<string, TextStyle>
}

/**
 * Merge a per-element style override (and, in interactive mode, the element id)
 * onto a base text style. Used by block builders so any text can be restyled
 * by id from the document's `styleOverrides`.
 */
export function styleFor(ctx: RenderContext, id: string, base: TextOptions): TextOptions {
  const out: TextOptions = { ...base }
  if (ctx.interactive) out.dataId = id
  const o = ctx.styleOverrides?.[id]
  if (o) {
    if (o.fontFamily) out.family = o.fontFamily
    if (o.color) out.fill = o.color
    if (o.size) out.size = o.size
    if (o.weight !== undefined) out.weight = o.weight
    // `align` is applied by the caller (it also moves x), see blocks.ts.
  }
  return out
}

export interface BlockResult {
  markup: string
  /** Vertical space consumed, measured from the block's top `y`. */
  height: number
}

// ---------------------------------------------------------------------------
// Numeric / text geometry
// ---------------------------------------------------------------------------

export function n(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

export function lineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.4)
}

/** Approximate advance width of a single character (no font metrics available). */
export function charWidth(char: string, fontSize: number, mono: boolean): number {
  const code = char.codePointAt(0) ?? 0
  const wide =
    code >= 0x1100 &&
    (code <= 0x115f ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd))
  if (wide) return fontSize
  return fontSize * (mono ? 0.6 : 0.52)
}

export function measureWidth(text: string, fontSize: number, mono = false): number {
  let total = 0
  for (const char of text) total += charWidth(char, fontSize, mono)
  return total
}

/** Greedy word/character wrap that handles both spaced text and CJK runs. */
export function wrapText(text: string, maxWidth: number, fontSize: number, mono = false): string[] {
  const out: string[] = []
  for (const paragraph of String(text).split('\n')) {
    let current = ''
    let width = 0
    let lastSpace = -1
    for (const char of paragraph) {
      const w = charWidth(char, fontSize, mono)
      if (width + w > maxWidth && current.length > 0) {
        if (lastSpace >= 0) {
          out.push(current.slice(0, lastSpace).trimEnd())
          current = current.slice(lastSpace + 1)
          width = measureWidth(current, fontSize, mono)
          lastSpace = -1
        } else {
          out.push(current)
          current = ''
          width = 0
        }
      }
      current += char
      width += w
      if (char === ' ') lastSpace = current.length - 1
    }
    out.push(current.trimEnd())
  }
  return out.length > 0 ? out : ['']
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  TWD: 'NT$',
  JPY: '¥',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  KRW: '₩',
  HKD: 'HK$',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  THB: '฿',
}
const ZERO_DECIMAL = new Set(['JPY', 'TWD', 'KRW'])

export function createMoneyFormatter(currency: string): (amount: number) => string {
  const code = currency.toUpperCase()
  const symbol = CURRENCY_SYMBOLS[code]
  const decimals = ZERO_DECIMAL.has(code) ? 0 : 2
  return (amount: number) => {
    const sign = amount < 0 ? '-' : ''
    const fixed = Math.abs(amount).toFixed(decimals)
    const [intPart, decPart] = fixed.split('.')
    const grouped = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const body = decPart ? `${grouped}.${decPart}` : grouped
    return symbol ? `${sign}${symbol}${body}` : `${sign}${body} ${code}`
  }
}

// ---------------------------------------------------------------------------
// SVG primitives
// ---------------------------------------------------------------------------

export interface TextOptions {
  size?: number
  weight?: number | string
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  family?: string
  opacity?: number
  letterSpacing?: number
  italic?: boolean
  /** Editor hit-test id, emitted as data-re-id (interactive mode only). */
  dataId?: string
}

export function svgText(content: string, x: number, y: number, options: TextOptions = {}): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    options.family ? `font-family="${escapeXml(options.family)}"` : '',
    `font-size="${n(options.size ?? 15)}"`,
    options.weight !== undefined ? `font-weight="${options.weight}"` : '',
    options.fill ? `fill="${escapeXml(options.fill)}"` : '',
    options.anchor ? `text-anchor="${options.anchor}"` : '',
    options.opacity !== undefined ? `opacity="${options.opacity}"` : '',
    options.letterSpacing ? `letter-spacing="${n(options.letterSpacing)}"` : '',
    options.italic ? `font-style="italic"` : '',
    options.dataId ? `data-re-id="${escapeXml(options.dataId)}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<text ${attrs}>${escapeXml(content)}</text>`
}

export interface RectOptions {
  fill?: string
  stroke?: string
  strokeWidth?: number
  rx?: number
  dash?: string
  opacity?: number
}

export function svgRect(
  x: number,
  y: number,
  width: number,
  height: number,
  options: RectOptions = {},
): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `width="${n(width)}"`,
    `height="${n(height)}"`,
    options.rx ? `rx="${n(options.rx)}"` : '',
    options.fill ? `fill="${escapeXml(options.fill)}"` : `fill="none"`,
    options.stroke ? `stroke="${escapeXml(options.stroke)}"` : '',
    options.strokeWidth ? `stroke-width="${n(options.strokeWidth)}"` : '',
    options.dash ? `stroke-dasharray="${options.dash}"` : '',
    options.opacity !== undefined ? `opacity="${options.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<rect ${attrs} />`
}

export interface LineOptions {
  stroke?: string
  strokeWidth?: number
  dash?: string
  opacity?: number
}

export function svgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: LineOptions = {},
): string {
  const attrs = [
    `x1="${n(x1)}"`,
    `y1="${n(y1)}"`,
    `x2="${n(x2)}"`,
    `y2="${n(y2)}"`,
    `stroke="${escapeXml(options.stroke ?? '#000000')}"`,
    `stroke-width="${n(options.strokeWidth ?? 1)}"`,
    options.dash ? `stroke-dasharray="${options.dash}"` : '',
    options.opacity !== undefined ? `opacity="${options.opacity}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<line ${attrs} />`
}

export interface Painter {
  text: (content: string, x: number, y: number, options?: TextOptions) => string
  rect: typeof svgRect
  line: typeof svgLine
  image: typeof svgImage
}

/** A painter with the theme font family pre-bound for text. */
export function createPainter(ctx: RenderContext): Painter {
  const family = ctx.theme.typography.fontFamily
  return {
    text: (content, x, y, options = {}) => svgText(content, x, y, { family, ...options }),
    rect: svgRect,
    line: svgLine,
    image: (href, x, y, width, height, options = {}) =>
      svgImage(href, x, y, width, height, { filter: ctx.monoFilterId, ...options }),
  }
}
