/**
 * Render every example × every theme to `samples/` (SVG + PNG) for the README.
 * Run with: pnpm samples  (after `pnpm build`)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeValidateReceipt, type ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToPng } from '@receipt-engine/render-png'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const examples = ['simple', 'cute-booth', 'openbooth-like']
const themes = ['custom', 'thermal'] as const

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function inline(src: string | undefined, baseDir: string): string | undefined {
  if (!src || /^data:/i.test(src) || /^https?:\/\//i.test(src)) return src
  if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(src) && !src.includes('/') && !src.includes('\\')) {
    return src // emoji / plain text
  }
  const path = isAbsolute(src) ? src : resolve(baseDir, src)
  const ext = (/\.[a-z0-9]+$/i.exec(src)?.[0] ?? '').toLowerCase()
  const data = readFileSync(path)
  return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${data.toString('base64')}`
}

function inlineAssets(receipt: ReceiptDocument, baseDir: string): ReceiptDocument {
  const out = structuredClone(receipt)
  out.merchant.logo = inline(out.merchant.logo, baseDir)
  out.merchant.icon = inline(out.merchant.icon, baseDir)
  for (const item of out.items) item.image = inline(item.image, baseDir)
  if (out.assets) {
    out.assets.footerImage = inline(out.assets.footerImage, baseDir)
    out.assets.backgroundImage = inline(out.assets.backgroundImage, baseDir)
  }
  for (const block of out.customBlocks ?? []) {
    if (block.type === 'image') block.src = inline(block.src, baseDir) ?? block.src
  }
  for (const sticker of out.stickers ?? []) {
    sticker.content = inline(sticker.content, baseDir) ?? sticker.content
  }
  return out
}

const outDir = resolve(root, 'samples')
mkdirSync(outDir, { recursive: true })

for (const example of examples) {
  const file = resolve(root, 'examples', example, 'receipt.json')
  const parsed = safeValidateReceipt(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success || !parsed.data) {
    console.error(`✗ ${example}: ${parsed.error?.format()}`)
    continue
  }
  const receipt = inlineAssets(parsed.data, dirname(file))
  for (const theme of themes) {
    const svg = renderReceiptToSvg(receipt, { theme, includeXmlDeclaration: true })
    writeFileSync(resolve(outDir, `${example}-${theme}.svg`), svg)
    const png = await renderReceiptToPng(receipt, { theme })
    writeFileSync(resolve(outDir, `${example}-${theme}.png`), png)
    console.log(`✓ samples/${example}-${theme}.{svg,png}`)
  }
}

console.log('\nDone. See ./samples')
