# Rendering

SVG is the canonical output. HTML wraps it; PNG rasterizes it.

```
receipt JSON ──validate──▶ normalize ──▶ SVG ──┬──▶ HTML (wrap)
                                               └──▶ PNG (resvg)
```

## SVG (`@receipt-engine/render-svg`)

```ts
renderReceiptToSvg(receipt, {
  theme?: ReceiptThemeName | ReceiptTheme, // default 'custom'
  width?: number,                          // default 720 (card) / 384 (thermal)
  padTop?: number,                         // top whitespace; default 4× side padding
  padBottom?: number,                      // bottom whitespace; default 4× side padding
  padX?: number,                           // left/right padding; default theme page spacing
  interactive?: boolean,                   // tag blocks/text with data-re-block / data-re-id (editor)
  fontFaceCss?: string,                    // injected as <style> after <defs> (embed fonts for PNG)
  monochromeImages?: boolean,              // force embedded images B&W; overrides the theme default
  transparentBackground?: boolean,         // drop ONLY the page background; keep the card (clean export)
  perforatedEdges?: boolean,               // torn / perforated card edges; overrides the theme default
  pixelRatio?: number,                     // carried through to PNG
  includeXmlDeclaration?: boolean,
}): string
```

- **`monochromeImages` / `perforatedEdges`** override the per-theme decoration
  defaults (`thermal` is mono + torn; `custom` is colour + plain), so any theme can
  opt in or out per render.
- **`transparentBackground`** is the "clean export": it removes only the page
  background behind the card; the card itself — shape, surface colour, border, torn
  edges and background image — is kept, so a PNG/SVG is just the receipt card on a
  transparent backdrop, ready to print. (`renderReceiptToHtml` honors the same three
  options and additionally drops the page chrome when transparent.)

- **Deterministic.** Same input → byte-identical SVG. No `Date.now`, no network.
- **Dynamic height.** Height grows with content; nothing is clipped.
- **Escaping.** Every piece of user text passes through `escapeXml` (`& < > " '`),
  so item names can't break the SVG.
- **Block order.** header → merchant → event → transaction → items → discounts →
  totals → payments → QR → custom blocks → message → footer image → stickers
  (rendered last, as an overlay).

### QR codes

```ts
import { renderQrSvg } from '@receipt-engine/render-svg'
const svg = renderQrSvg('https://example.com', { size: 160 })
```

QR is drawn as a single SVG `<path>` (one subpath per dark module), so it stays
crisp and seam-free at any size.

## Images & assets

The renderers **never read the filesystem or fetch remote URLs** — that keeps
them deterministic and usable in the browser / React Native. An image source is:

- a **data URI** — embedded as-is;
- an **http(s) URL** — embedded as an `<image href>` (loads in HTML/browser; not
  fetched for PNG);
- a **local path** — embedded verbatim. The **CLI** resolves local paths to data
  URIs (relative to the receipt JSON's folder) before rendering, so SVG/PNG are
  self-contained.

The **thermal** theme wraps every embedded image (logo, icon, footer, sticker)
in a grayscale SVG filter (`<feColorMatrix>`, id `re-mono`) so logos, photos, and
stickers come out black & white — matching thermal paper. Each `<image>` gets
`filter="url(#re-mono)"`, and resvg honors it when rasterizing to PNG. The
`custom` theme leaves images in full color.

## HTML (`@receipt-engine/render-html`)

```ts
renderReceiptToHtml(receipt, { theme?, width?, title?, pageBackground? }): string
```

A standalone, mobile-first document: `width=device-width` viewport, centered
card, `<title>` defaulting to `merchant · receiptNo`.

## PNG (`@receipt-engine/render-png`)

```ts
await renderReceiptToPng(receipt, { theme?, width?, pixelRatio?, defaultFontFamily? }): Promise<Buffer>
```

Rasterized with [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) at
`width * pixelRatio` (default `pixelRatio: 2`).

### Notes & limitations (v0.1)

- **Fonts.** PNG text uses installed system fonts (`loadSystemFonts`). SVG is
  fully deterministic; PNG text appearance depends on the host's fonts. Bundling
  a font for byte-deterministic PNG is on the v0.2 roadmap.
- **Color emoji** icons may render as empty boxes in PNG (resvg has limited color
  font support); they're fine in SVG/HTML. Prefer an image logo for PNG, or a
  monochrome symbol.
- **Browser/mobile PNG export** will reuse the same engine via
  `@resvg/resvg-wasm` (v0.2) — the SVG/HTML path already runs anywhere today.
