# @receipt-engine/playground

A static, client-side playground for `receipt-engine`. Fill in a form (shop, items,
message), upload a logo, add emoji/image stickers, pick colors & fonts, switch
between the **custom** and **thermal** themes, and preview/download the result as
SVG / HTML / PNG — **entirely in the browser** (no server, no network), so it works
on phones too. (A raw-JSON editor is tucked into an advanced panel.)

## Run locally

```bash
pnpm build                  # builds packages + the browser bundle
# then open the file in any browser:
#   apps/playground/public/index.html
```

On Windows: `start apps/playground/public/index.html` ·
macOS: `open apps/playground/public/index.html`.

## How it works

`src/entry.ts` re-exports the pure-JS APIs (`renderReceiptToSvg`,
`renderReceiptToHtml`, `getTheme`, `mergeTheme`, `safeValidateReceipt`) and tsup
bundles them into a single IIFE global, `public/receipt-engine.global.js`
(`window.ReceiptEngine`). `index.html` is a plain `<script>` page — no module
loading — so it also works from `file://`.

`pnpm --filter @receipt-engine/playground build` rebuilds the bundle.

## Deploy (use it on a phone)

The `public/` folder is fully static (one HTML + one JS). Host it anywhere:

- **GitHub Pages** — publish `apps/playground/public`.
- **Netlify / Vercel** — drag-and-drop the `public` folder.

Then open the URL on your phone. SVG/HTML rendering runs client-side, and PNG export
works in-browser too (the SVG is drawn to a `<canvas>` and exported — note that
custom web fonts may fall back to a system font in the PNG, and a receipt that
references an *external URL* image can't be exported to PNG due to canvas security;
uploaded/data-URI images are fine). A future `@resvg/resvg-wasm` path can improve
PNG font fidelity.
