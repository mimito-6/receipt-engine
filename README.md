<div align="center">

<img src="apps/playground/public/og-image.png" alt="receipt-engine" width="680">

# 🧾 receipt-engine

**Receipts, but delightful.**
Turn structured receipt JSON into beautiful, shareable, printable receipts — designed right in your browser.

<br>

[![Live editor](https://img.shields.io/badge/%E2%96%B6_Live_editor-open-d6336c?style=for-the-badge)](https://mimito-6.github.io/receipt-engine/)
&nbsp;
[![Docs](https://img.shields.io/badge/Docs-read-5b3256?style=for-the-badge)](docs/)

[![Deploy](https://github.com/mimito-6/receipt-engine/actions/workflows/pages.yml/badge.svg)](https://github.com/mimito-6/receipt-engine/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Front-end only](https://img.shields.io/badge/runs-100%25_in_browser-2f9e44?style=flat-square)

English · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

</div>

---

<p align="center">
  <a href="https://mimito-6.github.io/receipt-engine/">
    <img src="docs/assets/editor.png" alt="The in-browser direct-manipulation editor" width="900">
  </a>
</p>

> **One receipt JSON in → SVG, HTML, and PNG out.** Same data, many surfaces — with a delightful
> direct-manipulation editor on top. Built for artist-alley booths, doujin events, craft markets,
> pop-up stores, and local-first POS tools (e.g. [OpenBooth](apps/openbooth-bridge)).

A receipt doesn't have to be ugly. For a creator at a booth, the receipt is a **brand touchpoint** —
a tiny gift the customer keeps, scans, and shares. `receipt-engine` makes that easy while staying a
neutral, embeddable library: pass it a receipt JSON, get back PNG / SVG / HTML — or hand a merchant
the browser editor and let them design their own.

## ✨ Highlights

- 🖌️ **Direct-manipulation editor** — tap text to restyle, drag stickers to scale/rotate, drag the
  card edges to resize, drag blocks to reorder. Runs entirely in the browser, on phones too.
- 📄 **One schema, many outputs** — SVG (canonical) · HTML · PNG, all deterministic.
- 🎨 **Themes** — `custom` (colorful, change colors / fonts / stickers) and `thermal` (monospace,
  auto-grayscaled images), plus fully custom themes via `mergeTheme`.
- 🖨️ **Thermal printing** — ESC/POS raster (GS v 0) over **Web Bluetooth**, straight from the browser.
- 📲 **Browser PNG & share** — rasterize to PNG client-side (canvas) and share via Web Share — no server.
- 🌏 **i18n** — the editor UI ships in 中文 / 日本語 / English.
- 🔗 **QR codes**, 🔢 **smart totals**, 🧱 **custom blocks**, 🧩 **React component** + **CLI** + typed core.
- 🛡️ **Safe & deterministic** — every user value is escaped; the receipt never leaves the browser for a server.

## 🎨 Themes

| 🎨 `custom` — colorful & brandable | 🧾 `thermal` — receipt-printer look |
|:---:|:---:|
| <img src="docs/assets/receipt-custom.png" alt="custom theme" width="300"> | <img src="docs/assets/receipt-thermal.png" alt="thermal theme" width="300"> |
| Colors, fonts, stickers, logo, background image (scale / rotate), QR. | Monospace, B&W, torn perforated edges — what a real till prints. |

## 🚀 Try it

**▶️ [Open the live editor](https://mimito-6.github.io/receipt-engine/)** — no install, no login, works on your phone.
Edit the sample receipt right on the canvas, then download **PNG / SVG / HTML** or save a config file.

Or run it locally (pnpm monorepo — packages aren't published to npm yet):

```bash
pnpm install
pnpm build
pnpm test
# then open apps/playground/public/index.html in any browser
```

<details>
<summary><b>What you can do in the editor</b></summary>

- **Tap any text** → a contextual inspector to change its content, font, color, size and weight
  (saved per-element in `styleOverrides`); double-tap to edit text inline.
- **Tap a sticker** → a Photoshop-style frame: corner handles scale, a top handle rotates,
  two-finger pinch on touch; drag to move with alignment snapping.
- **Drag the card edges** → change width / top / bottom padding.
- **Drag a section** (or use the layout-order ↑/↓ panel) → reorder blocks (`blockOrder`).
- Upload a **logo / background** (background is scalable, rotatable, transparent-able), pick
  **colors & fonts**, toggle a **transparent** background / card / QR backing, switch `custom` /
  `thermal`, save/restore a config, and download **PNG with the fonts embedded** so the export
  matches the preview.

The editor only mutates the receipt model — exports stay deterministic and editor-metadata-free.
</details>

## 📦 Packages

| Package | What it does |
|---------|--------------|
| `@receipt-engine/core` | Schema, validation, normalization, totals. |
| `@receipt-engine/themes` | Built-in themes + `getTheme` / `mergeTheme`. |
| `@receipt-engine/render-svg` | Receipt → SVG string (canonical). |
| `@receipt-engine/render-html` | Receipt → standalone HTML. |
| `@receipt-engine/render-png` | Receipt → PNG `Buffer` (resvg, server-side). |
| `@receipt-engine/bitmap` | 1-bit dithering + bit-packing for thermal printers. |
| `@receipt-engine/escpos` | ESC/POS commands + raster output (GS v 0). |
| `@receipt-engine/connect` | Browser delivery: Web Bluetooth thermal print, canvas PNG, Web Share. |
| `@receipt-engine/import` | POS / order → receipt adapters (incl. OpenBooth) + template overlay. |
| `@receipt-engine/react` | `<ReceiptCard />`. |
| `@receipt-engine/cli` | `receipt-engine render …`. |

**Apps:** [`apps/playground`](apps/playground) — the static in-browser editor (deployed above) ·
[`apps/openbooth-bridge`](apps/openbooth-bridge) — the OpenBooth ⇄ receipt-engine integration bundle.

## 🧑‍💻 Use it as a library

```ts
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToPng } from '@receipt-engine/render-png'

const svg = renderReceiptToSvg(receipt, { theme: 'custom', width: 720 })
const png = await renderReceiptToPng(receipt, { theme: 'custom', pixelRatio: 2 })
```

```tsx
import { ReceiptCard } from '@receipt-engine/react'

export const App = () => <ReceiptCard receipt={receipt} theme="custom" width={360} />
```

<details>
<summary><b>CLI</b></summary>

```bash
# from the repo, the CLI runs via the dev script:
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme custom --format svg --out receipt.svg

# once built, the bin is available:
receipt-engine render receipt.json --theme custom --format png --out receipt.png
```

Options: `--theme custom|thermal`, `--format svg|html|png`, `--out <path>`, `--width <number>`,
`--pretty`. `svg`/`html` print to stdout when `--out` is omitted.
</details>

<details>
<summary><b>Theme customization</b></summary>

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const theme = mergeTheme(getTheme('custom'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme })
```
</details>

## 📄 Receipt JSON

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

Full field reference in [`docs/schema.md`](docs/schema.md). Ready-made examples live in
[`examples/`](examples) (`simple`, `cute-booth`, `openbooth-like`).

## 📱 Using it on a phone

The rendering paths are **pure front-end JavaScript** — SVG, HTML, and **PNG (canvas, via
`@receipt-engine/connect`)** all run directly in a mobile browser, no server required. That's how the
playground renders, exports PNG, and even **thermal-prints over Web Bluetooth** on a phone.
(`@receipt-engine/render-png` is a separate server-side path using a native module, for batch / Node.)

The simplest way to use it: **[open the deployed editor](https://mimito-6.github.io/receipt-engine/)**
on your phone. To embed rendering in your own app (React Native / WebView), import
`@receipt-engine/render-svg` or `@receipt-engine/render-html` directly.

## 📚 Docs

[Schema](docs/schema.md) · [Themes](docs/themes.md) · [Rendering](docs/rendering.md) · [Roadmap](docs/roadmap.md)

## 🗺️ Roadmap

**Shipped (v0.1)** in-browser editor · browser PNG export · ESC/POS thermal print over Web Bluetooth ·
OpenBooth integration · 中/日/英 i18n.
**Next** hosted receipt pages · coupon QR · community themes · plugin system.
Full list in [`docs/roadmap.md`](docs/roadmap.md).

## 📜 License

[MIT](LICENSE) © mimito
