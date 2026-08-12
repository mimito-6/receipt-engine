# Rendering

SVG is the canonical output. HTML wraps it; PNG rasterizes it.

```
receipt JSON ──validate──▶ normalize ──▶ SVG ──┬──▶ HTML (wrap)
                                               ├──▶ PNG (resvg, Node)
                                               ├──▶ PNG (canvas, browser)
                                               └──▶ 1-bpp ──▶ ESC/POS (thermal)
```

## SVG (`@receipt-engine/render-svg`)

```ts
renderReceiptToSvg(receipt, {
  theme?: ReceiptThemeName | ReceiptTheme, // default 'custom'
  width?: number,                          // default 720 (card) / 384 (thermal)
  paper?: PaperProfile,                    // lay out natively at a thermal profile's dot width
  padTop?: number,                         // top whitespace; default 4× side padding
  padBottom?: number,                      // bottom whitespace; default 4× side padding
  padX?: number,                           // left/right padding; default theme page spacing
  interactive?: boolean,                   // tag blocks/text with data-re-block / data-re-id (editor)
  fontFaceCss?: string,                    // injected as <style> after <defs> (embed fonts for PNG)
  monochromeImages?: boolean,              // force embedded images B&W; overrides the theme default
  backgroundInkBoost?: number,             // darken ONLY the background image; 1 = untouched, clamped to [1, 8]
  cropToCard?: boolean,                    // viewBox the canvas to the card, dropping the outer margin
  hideCardBorder?: boolean,                // drop the card's outline stroke
  transparentBackground?: boolean,         // drop ONLY the page background; keep the card (clean export)
  perforatedEdges?: boolean,               // torn / perforated card edges; overrides the theme default
  pixelRatio?: number,                     // carried through to PNG
  includeXmlDeclaration?: boolean,
}): string
```

- **`paper`** takes a `PaperProfile` from `@receipt-engine/core` (`PAPER_58`, `PAPER_80`)
  and drives the geometry: the layout width becomes `printableWidthDots`, and the outer
  margin, side padding, QR box and logo box come from the profile. An 80mm receipt is
  therefore a genuine 576-dot design, not a 384-dot one scaled up. An explicit `width`
  still wins.
- **`monochromeImages` / `perforatedEdges`** override the per-theme decoration
  defaults (`thermal` is mono + torn; `custom` is colour + plain), so any theme can
  opt in or out per render.
- **`backgroundInkBoost`** multiplies ink in the background image only, anchored at
  white (`L' = 255 - K(255 - L)`), so bare paper stays bare and only the mid-tones
  deepen. It is clamped to `[1, 8]`; values below 1 are ignored. The boost gets its own
  filter, so pushing the artwork cannot drag the logo and stickers down with it.
- **`cropToCard` / `hideCardBorder`** are the print pair. `cropToCard` is a viewBox
  change only — nothing re-flows — and removes the outer margin, which on a fixed-width
  head is spent paper width. `hideCardBorder` drops the card's outline, which after
  cropping is just two lines running the length of the receipt (and, by inking every
  row, defeats the blank-row elision that halves the bytes sent to a printer).
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

### Measuring a render

```ts
import { renderReceiptWithMetadata } from '@receipt-engine/render-svg'
import { PAPER_80 } from '@receipt-engine/core'

const { svg, metadata } = renderReceiptWithMetadata(receipt, { theme: 'thermal', paper: PAPER_80 })
// metadata: widthDots, heightDots, dpi, estimatedWidthMm, estimatedLengthMm,
//           feedAfterPrintMm, rollLengthMm, estimatedReceiptsPerRoll, bytesPerRow
```

Same render, plus the physical size of the receipt it describes — callers driving a
thermal printer need the dot dimensions anyway to size the raster, and the mm / roll
figures let a UI say "this receipt is 12cm of paper" without re-deriving the maths.
`dpi` and `feedAfterPrintMm` come from `options.paper` when present, so
`estimatedLengthMm` covers the whole paper cost of one receipt — the image plus the
blank feed after printing — and `estimatedReceiptsPerRoll` reflects that rather than
image height alone. The roll length assumed is `DEFAULT_ROLL_LENGTH_MM` (20000mm).

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
renderReceiptToHtml(receipt, {
  theme?, width?,
  padTop?, padBottom?, padX?,      // forwarded to the SVG renderer
  monochromeImages?,               // forwarded
  transparentBackground?,          // forwarded — also drops the HTML page chrome
  perforatedEdges?,                // forwarded
  title?,                          // defaults to `merchant · receiptNo`
  pageBackground?,                 // CSS colour behind the receipt
}): string
```

A standalone, mobile-first document: `width=device-width` viewport, centered
card, `<title>` defaulting to `merchant · receiptNo`. The `pad*`, `monochromeImages`,
`transparentBackground` and `perforatedEdges` options are passed straight through to
`renderReceiptToSvg`, so an HTML export matches the SVG one. When
`transparentBackground` is set, the page chrome goes too: `pageBackground` defaults to
`transparent` and the card's shadow and radius are dropped. Otherwise the page
defaults to `#e9e9ee`, and the `main` element is capped at `width` — or, without one,
at 420px for a thermal theme and 760px otherwise.

## PNG (`@receipt-engine/render-png`)

```ts
await renderReceiptToPng(receipt, { theme?, width?, pixelRatio?, defaultFontFamily? }): Promise<Buffer>
```

Rasterized with [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) at
`width * pixelRatio` (default `pixelRatio: 2`).

### Notes & limitations

- **Fonts.** `@receipt-engine/render-png` text uses installed system fonts
  (`loadSystemFonts`). SVG is fully deterministic; this PNG path's text appearance
  depends on the host's fonts. Bundling a font for byte-deterministic server-side PNG
  is still on the roadmap.
- **Color emoji** icons may render as empty boxes in PNG (resvg has limited color
  font support); they're fine in SVG/HTML. Prefer an image logo for PNG, or a
  monochrome symbol.

## PNG in the browser

Client-side PNG export **has shipped** — it does not use resvg. The SVG is loaded into
an isolated `<img>` from a blob URL and drawn to a `<canvas>`:

- `svgToPngBlob` / `svgToImageData` in `@receipt-engine/connect` are the reusable
  bridge (the same raster feeds the thermal print path).
- The playground's own export lives in `apps/playground/src/app/pngExport.ts`. It
  rasterizes at 2×, clamped so a tall receipt cannot exceed the browser canvas cap
  (4096px per side, ~16M px).

Because an SVG in an `<img>` cannot see the page's `@font-face` rules, that export
first builds base64 `@font-face` CSS for the fonts the receipt actually uses and passes
it to `renderReceiptToSvg` as `fontFaceCss`: bundled pixel faces are fetched
same-origin from `fonts/`, Google faces are fetched through the `css2` API subsetted to
the glyphs on the receipt (`&text=`) and their `gstatic.com` binaries inlined as data
URIs. Each fetch has a 4-second timeout, and any font that fails to load is skipped —
the export still succeeds, with that face falling back to a system font.

An optional `@resvg/resvg-wasm` path (higher fidelity than canvas) remains on the
roadmap; nothing in the repo uses it today.
