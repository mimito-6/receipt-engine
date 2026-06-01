import { escapeXml } from './escape'

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

export function isDataUri(src: string): boolean {
  return /^data:/i.test(src)
}

export function isHttpUrl(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

/** A bare path/filename that points at an image (no scheme). */
export function isLocalImagePath(src: string): boolean {
  if (isDataUri(src) || isHttpUrl(src)) return false
  return IMAGE_EXT.test(src) || src.includes('/') || src.includes('\\')
}

/**
 * True when `src` should be rendered as an `<image>` (data URI, http(s) URL,
 * or a local image path). Everything else (e.g. an emoji) is treated as text.
 */
export function isImageSource(src: string | undefined | null): src is string {
  if (!src) return false
  return isDataUri(src) || isHttpUrl(src) || isLocalImagePath(src)
}

export type ImageSourceKind = 'data' | 'url' | 'path'

export function classifyImageSource(src: string): ImageSourceKind {
  if (isDataUri(src)) return 'data'
  if (isHttpUrl(src)) return 'url'
  return 'path'
}

function fmt(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

export interface SvgImageOptions {
  preserveAspectRatio?: string
}

/**
 * Emit an `<image>` element. This does NOT read the filesystem or fetch
 * anything — `href` is embedded verbatim (after escaping). The CLI is
 * responsible for converting local paths to data URIs beforehand.
 */
export function svgImage(
  href: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: SvgImageOptions = {},
): string {
  const par = options.preserveAspectRatio ?? 'xMidYMid meet'
  return `<image href="${escapeXml(href)}" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" preserveAspectRatio="${par}" />`
}
