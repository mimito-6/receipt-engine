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
  const svg = renderReceiptToSvg(doc, {
    theme: options.theme,
    width: options.width,
    padTop: options.padTop,
    padBottom: options.padBottom,
    padX: options.padX,
  })
  const title = options.title ?? `${doc.merchant.name || 'Receipt'} · ${doc.transaction.receiptNo}`
  const pageBackground = options.pageBackground ?? '#e9e9ee'
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
    display: block;
    border-radius: 12px;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.12));
  }
</style>
</head>
<body>
<main>${svg}</main>
</body>
</html>
`
}
