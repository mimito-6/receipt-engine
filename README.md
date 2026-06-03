# receipt-engine

**English** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

Receipts, but delightful.

`receipt-engine` is an open-source rendering engine for beautiful, shareable,
and printable receipts. It turns structured receipt JSON into branded digital
receipt cards, SVG/HTML previews, PNG images, and future thermal-printer output.

It is designed for POS apps, artist alley booths, doujin events, craft markets,
pop-up stores, and local-first commerce tools.

> One receipt JSON in → SVG, HTML, and PNG out. Same data, many surfaces.

---

## Why

A receipt doesn't have to be ugly. For a creator at an artist alley or a stall
at a craft market, the receipt is a **brand touchpoint** — a tiny gift the
customer keeps, scans, and shares. `receipt-engine` makes that easy while
staying a neutral, embeddable library (e.g. drop it into an offline-first POS
like OpenBooth: pass a receipt JSON, get back PNG / SVG / HTML).

## Features

- 📄 **One schema, many outputs** — SVG (canonical), HTML, PNG.
- 🎨 **Themes** — `custom` (the colorful default) and `thermal`, plus full custom themes. The `custom` theme lets you change colors, pick fonts, and add stickers; `thermal` is monospace and auto-converts embedded images to black & white.
- 🧱 **Custom blocks** — text, image, divider, QR, between totals and message.
- 🔢 **Smart totals** — subtotals, discounts, tax, payments and change computed for you.
- 🔗 **QR codes** — digital receipt, social, coupon, feedback links.
- 🧩 **React component** + **CLI** + typed core API.
- 🛡️ **Safe & deterministic** — every value escaped; no network, no fonts fetched.
- 📱 **Mobile-ready** — SVG/HTML render anywhere; PNG via a WASM-capable engine.

## Packages

| Package | What it does |
|---------|--------------|
| `@receipt-engine/core` | Schema, validation, normalization, totals. |
| `@receipt-engine/themes` | Built-in themes + `getTheme` / `mergeTheme`. |
| `@receipt-engine/render-svg` | Receipt → SVG string (canonical). |
| `@receipt-engine/render-html` | Receipt → standalone HTML. |
| `@receipt-engine/render-png` | Receipt → PNG `Buffer` (resvg). |
| `@receipt-engine/react` | `<ReceiptCard />`. |
| `@receipt-engine/cli` | `receipt-engine render …`. |
| `@receipt-engine/playground` | Static in-browser playground (runs on phones). |

## Install (development)

This is a pnpm monorepo. Packages are not published to npm yet — clone and build:

```bash
pnpm install
pnpm build
pnpm test
```

## Try it in the browser (playground)

A static, client-side **direct-manipulation editor** lives in
[`apps/playground`](apps/playground). After `pnpm build`, open
`apps/playground/public/index.html` in any browser and edit the receipt right on
the canvas:

- **Tap any text** → a contextual inspector to change its content, font, color,
  size and weight (saved per-element in `styleOverrides`); double-tap to edit text.
- **Tap a sticker** → a Photoshop-style frame: corner handles scale, a top handle
  rotates, two-finger pinch on touch; drag to move with alignment snapping.
- **Drag the card edges** → change width / top / bottom padding.
- **Drag a section** (or use the 版面順序 ↑/↓ panel) → reorder blocks (`blockOrder`).
- Upload a logo / background, pick colors & fonts, switch `custom` / `thermal`
  themes, save/restore a config file, and download as SVG / HTML / **PNG (with the
  fonts embedded, so the export matches the preview)**.

Everything runs entirely in the browser and is fully touch-friendly, so it works
on phones too (see [Using it on a phone](#using-it-on-a-phone)). The editor only
mutates the receipt model — exports stay deterministic and editor-metadata-free.

## CLI

```bash
# from the repo, the CLI runs via the dev script:
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme custom --format svg  --out receipt.svg
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme custom --format html --out receipt.html
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme custom --format png  --out receipt.png
```

Once built, the `receipt-engine` bin is available:

```bash
receipt-engine render receipt.json --theme custom --format png --out receipt.png
```

Options: `--theme custom|thermal`, `--format svg|html|png`, `--out <path>`,
`--width <number>`, `--pretty`. `svg`/`html` print to stdout when `--out` is omitted.

## TypeScript API

```ts
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToPng } from '@receipt-engine/render-png'

const svg = renderReceiptToSvg(receipt, { theme: 'custom', width: 720 })
const png = await renderReceiptToPng(receipt, { theme: 'custom', pixelRatio: 2 })
```

## React

```tsx
import { ReceiptCard } from '@receipt-engine/react'

export function App() {
  return <ReceiptCard receipt={receipt} theme="custom" width={360} />
}
```

## Receipt JSON

```jsonc
{
  "schemaVersion": "0.1",
  "currency": "TWD",
  "merchant": { "name": "Mimito Booth", "subtitle": "手作 × 插畫 × 小誌", "logo": "./assets/logo.svg" },
  "event": { "name": "Artist Alley", "boothNumber": "A12" },
  "transaction": { "receiptNo": "AA-A12-018", "issuedAt": "2026-06-01T14:30:00+08:00" },
  "items": [
    { "name": "Sticker Set", "quantity": 2, "unitPrice": 120, "tags": ["新刊"] },
    { "name": "Mini Zine", "quantity": 1, "unitPrice": 180, "tags": ["特典"] }
  ],
  "discounts": [{ "label": "Set deal", "amount": 50 }],
  "payments": [{ "method": "Cash", "amount": 700 }],
  "qr": { "value": "https://instagram.com/mimito.art", "label": "追蹤我們" },
  "message": { "title": "Thank you! ♡", "body": "感謝支持我們的攤位！" }
}
```

See [`docs/schema.md`](docs/schema.md) for the full field reference, and the
[`examples/`](examples) folder for `simple`, `cute-booth`, and `openbooth-like`.

## Theme customization

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const theme = mergeTheme(getTheme('custom'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme })
```

## Generate sample images

```bash
pnpm build
pnpm samples   # writes samples/<example>-<theme>.{svg,png}
```

## Using it on a phone

A quick mental model of what runs where:

- This project is a **library + CLI** — it runs on a computer or server, not as a
  phone app you install.
- But **SVG and HTML rendering is pure front-end JavaScript** — it runs directly in
  a mobile browser, no server required. That's how the playground works on a phone.
- Only **PNG rendering** currently needs a computer/server (it uses a native module).
  v0.2 will add a browser-capable path (`@resvg/resvg-wasm`) so phones can export
  PNG client-side too.

Three practical ways to use it on a phone today:

1. **Recommended** — deploy `apps/playground/public` (one HTML + one `.js`) to any
   static host (GitHub Pages, Netlify, Vercel) and open the URL on your phone.
2. **Same Wi-Fi** — run a static server on your computer and open `http://<your-ip>:<port>` from the phone.
3. **Just view output** — generate a PNG/HTML with the CLI and send the file to the
   phone; phones open images and web pages natively.

To embed rendering in your own mobile app (React Native / WebView), import
`@receipt-engine/render-svg` or `@receipt-engine/render-html` directly — neither has
any computer-only dependency.

## Docs

- [Schema](docs/schema.md)
- [Themes](docs/themes.md)
- [Rendering](docs/rendering.md)
- [Roadmap](docs/roadmap.md)

## Roadmap (short)

**v0.2** theme playground, browser-side PNG export · **v0.3** ESC/POS &
58/80mm thermal · **v0.4** hosted receipt pages, coupon QR, community themes ·
**v0.5** plugin system. Full list in [`docs/roadmap.md`](docs/roadmap.md).

## License

[MIT](LICENSE) © mimito
