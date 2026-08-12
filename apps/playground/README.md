# @receipt-engine/playground

A static, client-side playground for `receipt-engine`. Fill in a form (shop, items,
message), upload a logo, drop on vector stickers, pick colors & fonts, switch between
the **custom** and **thermal** themes, and preview/download the result as SVG / HTML /
PNG — or print it on a Bluetooth thermal printer. Every render, export and print runs
**in the browser**: no build step at runtime, no server, and the receipt is never
uploaded anywhere. (A raw-JSON editor is tucked into an advanced panel.)

The page does load two font CDNs — Google Fonts (`fonts.googleapis.com` /
`fonts.gstatic.com`) and `cdn.jsdelivr.net` for `@fontsource/sarasa-mono-tc` — and the
PNG/SVG/print exports fetch Google Fonts again to embed the faces they use. So it is
"local-first", not "offline": your data stays put, the typefaces come over the network.

## Run locally

```bash
pnpm build                              # builds packages + the browser bundles
npx serve apps/playground/public        # …or any static file server
# then open the printed http://localhost:… URL
```

**Serve it over HTTP — don't open `index.html` from `file://`.** The page itself will
load, but two things quietly break:

- **Font embedding.** The bundled pixel faces are fetched same-origin from `fonts/`,
  which a `file://` page is not allowed to do — so PNG/SVG exports fall back to
  whatever the machine has installed.
- **Bluetooth printing.** Web Bluetooth needs a secure context (`https://` or
  `localhost`), so the print panel reports the browser as unsupported.

Both work from a plain local server, and `localhost` counts as secure.

## How it works

`tsup` builds three self-contained IIFE bundles into `public/`:

| Bundle | Entry | What it is |
|---|---|---|
| `playground.global.js` | `src/app/main.ts` | The editor app — **this is what `index.html` loads**. Bundles the engine. |
| `receipt-engine.global.js` | `src/entry.ts` | Engine only, as the `ReceiptEngine` global (`renderReceiptToSvg`, `renderReceiptToHtml`, `getTheme`, `mergeTheme`, `safeValidateReceipt`). Kept for embedders and docs; the editor does not use it. |
| `print-test.global.js` | `src/print-test/main.ts` | The standalone BLE printer bench behind `print-test.html`. |

`index.html` is a plain `<script>` page — no module loading, no bundler at runtime.

`pnpm --filter @receipt-engine/playground build` rebuilds all three.

## Stickers

The sticker tray is **16 vector marks, not emoji** — each one an inline SVG data URI
placed as an image sticker, so it stays crisp at any size and rasterizes identically in
the PNG export instead of depending on the platform's emoji font. They are solid fills
with no outline strokes, in the project's ink / ultramarine / lime palette: sparkles,
star, heart, lightning, flower, blob, teardrop, sun, cloud, speech bubble, cross,
confetti, moon, pennant, diamond. You can still upload your own image as a sticker.

## Deploy (use it on a phone)

The `public/` folder is fully static (HTML + the built bundles + fonts, all referenced
with relative paths). Host it anywhere:

- **GitHub Pages** — publish `apps/playground/public`.
- **Netlify / Vercel** — drag-and-drop the `public` folder.

Then open the URL on your phone. Rendering and PNG export both run client-side: the SVG
is drawn to a `<canvas>` at 2× (clamped so a tall receipt stays inside the browser's
canvas cap) and exported. **The fonts are embedded**, so the PNG matches the preview —
the faces the receipt uses are fetched and inlined as base64 `@font-face` rules, with
Google faces subsetted to just the glyphs on that receipt. Each fetch has a 4-second
timeout and any face that fails to arrive is simply skipped, so a bad connection costs
you a typeface, never the export.

One caveat still stands: a receipt referencing an image by **external URL** may not make
it into the PNG (an SVG loaded into an `<img>` will not pull in remote resources).
Uploaded / data-URI images are fine, and that is what the upload buttons produce.

## Thermal printing over Bluetooth (BLE)

The **熱感印表機列印(藍牙)** panel prints *the design currently open in the editor* —
its width, padding, stickers and block order intact — to an ESC/POS thermal printer over
Web Bluetooth. Needs Chrome or Edge on a secure origin; Safari and Firefox have no Web
Bluetooth, and the connection must start from your tap (browsers only show the device
chooser on a real user gesture).

The design is **not** re-laid-out at the printer's dot width — that would re-wrap the
text and slide every sticker, since sticker coordinates are absolute in the design's own
canvas. Instead the design's SVG is rasterized to the head width, which is a vector
rasterization (the browser re-renders the type at final resolution), so the print is
natively 576 or 384 dots wide *and* keeps the exact proportions you designed. Before
rasterizing, the render drops the page background and the outer margin, hides the card
outline, forces images monochrome, and embeds the design's own subsetted fonts.

### Controls

| Control | What it does | Default |
|---|---|---|
| 印表機 Printer | `gprinter-ble-80`, `generic-58`, `generic-80`. Switching one also switches the paper and re-seeds the pacing. | Gprinter BLE 80mm |
| 紙寬 Paper | 80mm · 576 dots / 58mm · 384 dots (72 / 48 bytes per raster row). | from the printer profile |
| 傳輸速度 Transfer speed | Turbo 180B / 0ms · Fast 100B / 5ms · Safe 20B / 20ms. Rungs above the profile's measured write ceiling are disabled. | Turbo |
| 白底黑字 | Forces a black-on-white palette while keeping the design's own fonts and spacing (swapping in the whole thermal theme would re-flow the layout). Required for dark designs, which otherwise print as a black slab. | on |
| 影像處理 | 1-bit conversion mode — see below. | 混合 hybrid |
| 黑白門檻 Threshold | 100–250. Under hybrid and halftone it is the *solid-ink floor*: anything darker prints solid, so the slider reads as glyph weight. Inert (and greyed out) under full dither, which conserves tone by construction. | 145 |
| 底圖濃度 Artwork density | 0–100%. Greyed out when the design has no background image. | 30% |
| 列印後送紙 Feed | 0–40mm of blank paper after the image. 20mm rather than the library's neutral 12mm, because these printers have no cutter and the trailing edge has to clear the tear bar by hand. | 20mm |
| 可靠模式 Reliable mode | Wait for the printer to acknowledge every packet — slower, but no silent drops. | off |

### Image-processing modes

Thermal paper is two-tone: every dot is burned or not, and grey does not exist. The mode
decides how tones in between are faked.

- **混合 Hybrid** (default, and what `@receipt-engine/connect` uses when a caller passes
  nothing). Splits the tonal range instead of picking a point in it: at or below the
  threshold is solid ink, at or above 250 is bare paper, and only the mid-tones between
  are error-diffused. Clamped pixels absorb their error rather than propagating it, so
  neither solid glyphs nor clean paper can pick up noise from their neighbours. Crisp
  type *and* surviving background artwork.
- **網點 Halftone**, with five spot shapes — **round, diamond, line, heart, star**.
  Grows one clustered dot per cell from the centre outward, the way newsprint does,
  instead of scattering isolated dots. Clustered marks burn solidly where an isolated
  dot gets less heat than one with burning neighbours and prints weak and grey; the cost
  is tonal resolution, since an N×N cell can only express N²+1 levels. The cell is 8 dots
  (about 1mm at 203 dpi) for round, diamond and line; heart and star get 12, because they
  need the extra size to read as anything but a blob. The same ink/paper clamps as hybrid
  apply, so type is never screened.
- **銳利 Sharp** — a hard global threshold, nothing dithered. Cleanest output, fewest
  bytes, and light artwork disappears entirely.
- **全抖色 Full dither** — Floyd–Steinberg across the whole sheet. For photographs; it
  stipples solid glyphs into grey mush, and because it leaves no row fully blank it also
  defeats blank-row elision, which multiplies the bytes sent.

### Preview, estimate, self test

The preview canvas shows **the actual 1-bit output** — the same render, the same
rasterization to the head width, the same conversion — not a colour approximation, since
a colour preview cannot tell you whether type will hold together or artwork will
survive, which is precisely what these sliders decide. It re-draws about a fifth of a
second after you stop dragging, and the raster is cached so moving the threshold
re-thresholds cached pixels instead of re-rendering.

**估算長度 Estimate** measures the current design for the selected paper without
touching Bluetooth: dots, millimetres, ink coverage (the share of dots that will
actually be burned — near 0% means faint artwork is being dropped, high means a muddy,
slow sheet), ESC/POS byte count, and receipts per 20m roll.

**自我測試 Self test** sends 48 bytes of plain ASCII — no raster, no fonts, no images.
If that prints, the BLE path is sound and any failure is in the image data; if it does
not, the bytes are not reaching the printer at all and no amount of raster tweaking will
help.

When a GATT write fails, the status line names the next slower pacing rung by its label
rather than repeating the browser's opaque error, because "packet over the negotiated
MTU" and "printer's buffer flooded" look identical from JavaScript and want opposite
responses.

### Saved settings

All of it — printer, paper, pacing, image mode, threshold, artwork density, feed,
白底黑字 and reliable mode — is written into the editor's config file under `print` and
restored with it. Threshold and artwork density are tuned against a particular design on
particular paper, so they are part of the design in practice. Anything a config names
that this build no longer offers is ignored rather than blanking the control.
