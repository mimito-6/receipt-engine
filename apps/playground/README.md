# @receipt-engine/playground

A static, client-side playground for `receipt-engine`. Edit receipt JSON, switch
themes, and preview/download the result — **entirely in the browser** (no server,
no network), so it works on phones too.

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

Then open the URL on your phone. SVG/HTML rendering runs client-side; PNG export in
the browser is planned for v0.2 via `@resvg/resvg-wasm`.
