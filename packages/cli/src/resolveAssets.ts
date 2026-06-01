import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { ReceiptDocument } from '@receipt-engine/core'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

/** A local image path that should be inlined (not a data URI, URL, or emoji). */
function isResolvable(src: string | undefined): src is string {
  if (!src) return false
  if (/^data:/i.test(src) || /^https?:\/\//i.test(src)) return false
  return IMAGE_EXT.test(src) || src.includes('/') || src.includes('\\')
}

function toDataUri(src: string, baseDir: string): string {
  const path = isAbsolute(src) ? src : resolve(baseDir, src)
  const ext = (/\.[a-z0-9]+$/i.exec(src)?.[0] ?? '').toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  const data = readFileSync(path)
  return `data:${mime};base64,${data.toString('base64')}`
}

export interface ResolveAssetsResult {
  receipt: ReceiptDocument
  warnings: string[]
}

/**
 * Inline local image paths (relative to `baseDir`, the receipt JSON's folder)
 * as data URIs so the SVG/PNG output is self-contained. Data URIs, http(s)
 * URLs, and emoji are left untouched. Unreadable files are reported as warnings
 * and left as-is.
 */
export function resolveAssets(receipt: ReceiptDocument, baseDir: string): ResolveAssetsResult {
  const out = structuredClone(receipt)
  const warnings: string[] = []

  const field = (src: string | undefined): string | undefined => {
    if (!isResolvable(src)) return src
    try {
      return toDataUri(src, baseDir)
    } catch {
      warnings.push(`Could not read image: ${src}`)
      return src
    }
  }

  out.merchant.logo = field(out.merchant.logo)
  out.merchant.icon = field(out.merchant.icon)
  for (const item of out.items) item.image = field(item.image)
  if (out.assets) {
    out.assets.footerImage = field(out.assets.footerImage)
    out.assets.backgroundImage = field(out.assets.backgroundImage)
  }
  for (const block of out.customBlocks ?? []) {
    if (block.type === 'image') block.src = field(block.src) ?? block.src
  }

  return { receipt: out, warnings }
}
