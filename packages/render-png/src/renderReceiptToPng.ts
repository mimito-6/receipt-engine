import { validateReceipt, type ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToSvg, type RenderSvgOptions } from '@receipt-engine/render-svg'
import { Resvg } from '@resvg/resvg-js'

export interface RenderPngOptions {
  theme?: RenderSvgOptions['theme']
  width?: number
  /** Output scale factor for crisp rasterization. Defaults to 2. */
  pixelRatio?: number
  /** Font family resvg falls back to when no listed font is installed. */
  defaultFontFamily?: string
}

function svgWidth(svg: string, fallback: number): number {
  const match = /<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/.exec(svg)
  return match ? Number(match[1]) : fallback
}

/**
 * Render a receipt to a PNG buffer.
 *
 * Pipeline: validate -> render SVG -> rasterize with resvg. Note that resvg
 * does not fetch remote URLs, so any images must already be data URIs (the
 * CLI resolves local paths to data URIs before calling this).
 */
export async function renderReceiptToPng(
  receipt: ReceiptDocument,
  options: RenderPngOptions = {},
): Promise<Buffer> {
  const doc = validateReceipt(receipt)
  const svg = renderReceiptToSvg(doc, { theme: options.theme, width: options.width })

  const pixelRatio = options.pixelRatio ?? 2
  const baseWidth = options.width ?? svgWidth(svg, 720)

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.max(1, Math.round(baseWidth * pixelRatio)) },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: options.defaultFontFamily ?? 'Arial',
    },
  })

  const rendered = resvg.render()
  return Buffer.from(rendered.asPng())
}
