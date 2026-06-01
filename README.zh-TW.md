# receipt-engine

[English](README.md) · **繁體中文** · [日本語](README.ja.md)

收據,但要賞心悅目。

`receipt-engine` 是一個開源的收據渲染引擎,把結構化的 receipt JSON 變成有品牌感、可分享、可列印的收據——品牌化的數位收據卡、SVG/HTML 預覽、PNG 圖片,以及未來的熱感印表機輸出。

它專為 POS app、artist alley 攤位、同人場、手作市集、快閃店,以及 local-first 商務工具而設計。

> 一份 receipt JSON 進 → SVG、HTML、PNG 出。同一份資料,多種呈現面。

---

## 為什麼做這個

收據不一定要醜。對 artist alley 的創作者或手作市集的攤主來說,收據是一個**品牌觸點**——一份顧客會留著、會掃、會分享的小禮物。`receipt-engine` 讓這件事變簡單,同時保持成一個中立、可嵌入的函式庫(例如丟進像 OpenBooth 這種 offline-first POS:傳一份 receipt JSON 進去,就拿到 PNG / SVG / HTML)。

## 功能特色

- 📄 **一份 schema,多種輸出** — SVG(canonical)、HTML、PNG。
- 🎨 **主題** — `minimal`、`cute`、`thermal`,也支援完整自訂主題。
- 🧱 **自訂區塊** — text、image、divider、QR,渲染在 totals 與 message 之間。
- 🔢 **智慧計算** — 小計、折扣、稅、付款與找零都自動算好。
- 🔗 **QR code** — 數位收據、社群、優惠券、回饋連結。
- 🧩 **React 元件** + **CLI** + 有完整型別的 core API。
- 🛡️ **安全且 deterministic** — 每個值都會 escape;不連網、不抓字型。
- 📱 **手機友善** — SVG/HTML 到處都能跑;PNG 由可 WASM 化的引擎產生。

## Packages

| Package | 職責 |
|---------|------|
| `@receipt-engine/core` | Schema、驗證、normalize、totals。 |
| `@receipt-engine/themes` | 內建主題 + `getTheme` / `mergeTheme`。 |
| `@receipt-engine/render-svg` | Receipt → SVG 字串(canonical)。 |
| `@receipt-engine/render-html` | Receipt → 獨立 HTML。 |
| `@receipt-engine/render-png` | Receipt → PNG `Buffer`(resvg)。 |
| `@receipt-engine/react` | `<ReceiptCard />`。 |
| `@receipt-engine/cli` | `receipt-engine render …`。 |

## 安裝(開發中)

這是一個 pnpm monorepo。套件尚未發佈到 npm——請 clone 後自行 build:

```bash
pnpm install
pnpm build
pnpm test
```

## CLI

```bash
# 在 repo 內,CLI 透過 dev script 執行:
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format svg  --out receipt.svg
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format html --out receipt.html
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format png  --out receipt.png
```

build 之後,`receipt-engine` 這個 bin 就能直接用:

```bash
receipt-engine render receipt.json --theme cute --format png --out receipt.png
```

選項:`--theme minimal|cute|thermal`、`--format svg|html|png`、`--out <path>`、
`--width <number>`、`--pretty`。省略 `--out` 時,`svg`/`html` 會輸出到 stdout。

## TypeScript API

```ts
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToPng } from '@receipt-engine/render-png'

const svg = renderReceiptToSvg(receipt, { theme: 'cute', width: 720 })
const png = await renderReceiptToPng(receipt, { theme: 'cute', pixelRatio: 2 })
```

## React

```tsx
import { ReceiptCard } from '@receipt-engine/react'

export function App() {
  return <ReceiptCard receipt={receipt} theme="cute" width={360} />
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
  "message": { "title": "Thank you! ♡", "body": "感謝支持我們的攤位!" }
}
```

完整欄位說明請看 [`docs/schema.md`](docs/schema.md),範例則在
[`examples/`](examples) 資料夾(`simple`、`cute-booth`、`openbooth-like`)。

## 主題自訂

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const theme = mergeTheme(getTheme('minimal'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme })
```

## 產生範例圖

```bash
pnpm build
pnpm samples   # 輸出 samples/<example>-<theme>.{svg,png}
```

## 文件

- [Schema](docs/schema.md)
- [Themes](docs/themes.md)
- [Rendering](docs/rendering.md)
- [Roadmap](docs/roadmap.md)

## Roadmap(精簡)

**v0.2** 主題 playground、瀏覽器端 PNG 匯出 · **v0.3** ESC/POS 與
58/80mm 熱感 · **v0.4** hosted receipt page、優惠券 QR、社群主題 ·
**v0.5** plugin 系統。完整清單見 [`docs/roadmap.md`](docs/roadmap.md)。

## 授權

[MIT](LICENSE) © mimito
