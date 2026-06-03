import { validateReceipt, type ReceiptDocument } from '@receipt-engine/core'
import { escapeXml, renderReceiptToSvg, type RenderSvgOptions } from '@receipt-engine/render-svg'

export interface RenderHtmlOptions {
  theme?: RenderSvgOptions['theme']
  width?: number
  /** Top whitespace inside the card, in px (forwarded to the SVG renderer). */
  padTop?: number
  /** Bottom whitespace inside the card, in px (forwarded to the SVG renderer). */
  padBottom?: number
  /** Left/right padding inside the card, in px (forwarded to the SVG renderer). */
  padX?: number
  /** Override the document `<title>`. Defaults to `merchant · receiptNo`. */
  title?: string
  /** CSS color for the page behind the receipt. */
  pageBackground?: string
  /** Force all embedded images B&W (forwarded to the SVG renderer). */
  monochromeImages?: boolean
  /** Drop only the page background (keep the card) — a clean receipt for printing.
   *  Also removes the HTML page chrome (desk colour, card shadow & radius). */
  transparentBackground?: boolean
  /** Torn / perforated card edges (forwarded to the SVG renderer). */
  perforatedEdges?: boolean
}

function maxWidthFor(options: RenderHtmlOptions): number {
  if (options.width) return options.width
  const theme = options.theme
  const isThermal = theme === 'thermal' || (typeof theme === 'object' && theme.mode === 'thermal')
  return isThermal ? 420 : 760
}

/** Wrap a receipt's SVG in a standalone, mobile-friendly HTML document. */
export function renderReceiptToHtml(receipt: ReceiptDocument, options: RenderHtmlOptions = {}): string {
  const doc = validateReceipt(receipt)
  const clean = !!options.transparentBackground
  const svg = renderReceiptToSvg(doc, {
    theme: options.theme,
    width: options.width,
    padTop: options.padTop,
    padBottom: options.padBottom,
    padX: options.padX,
    monochromeImages: options.monochromeImages,
    transparentBackground: options.transparentBackground,
    perforatedEdges: options.perforatedEdges,
  })
  const title = options.title ?? `${doc.merchant.name || 'Receipt'} · ${doc.transaction.receiptNo}`
  // A clean export drops the page chrome too (no desk colour, no card shadow/radius).
  const pageBackground = options.pageBackground ?? (clean ? 'transparent' : '#e9e9ee')
  const maxWidth = maxWidthFor(options)
  const lang = doc.locale ?? 'en'

  return `<!doctype html>
<html lang="${escapeXml(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeXml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: ${pageBackground};
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main {
    width: 100%;
    max-width: ${maxWidth}px;
  }
  main svg {
    width: 100%;
    height: auto;
    display: block;${clean ? '' : `
    border-radius: 12px;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.12));`}
  }
</style>
</head>
<body>
<main>${svg}</main>
</body>
</html>
`
}
