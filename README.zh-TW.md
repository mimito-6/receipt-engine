<div align="center">

<img src="apps/playground/public/og-image.png" alt="receipt-engine" width="680">

# 🧾 receipt-engine

**讓收據變好看。**
把結構化的收據 JSON,變成漂亮、可分享、可列印的收據 —— 直接在瀏覽器裡設計。

<br>

[![Live editor](https://img.shields.io/badge/%E2%96%B6_%E7%B7%9A%E4%B8%8A%E7%B7%A8%E8%BC%AF%E5%99%A8-open-d6336c?style=for-the-badge)](https://mimito-6.github.io/receipt-engine/)
&nbsp;
[![Docs](https://img.shields.io/badge/Docs-read-5b3256?style=for-the-badge)](docs/)

[![Deploy](https://github.com/mimito-6/receipt-engine/actions/workflows/pages.yml/badge.svg)](https://github.com/mimito-6/receipt-engine/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![純前端](https://img.shields.io/badge/%E7%B4%94%E5%89%8D%E7%AB%AF-100%25_%E7%80%8F%E8%A6%BD%E5%99%A8%E5%85%A7-2f9e44?style=flat-square)

[English](README.md) · **繁體中文** · [日本語](README.ja.md)

</div>

---

<p align="center">
  <a href="https://mimito-6.github.io/receipt-engine/">
    <img src="docs/assets/editor.png" alt="瀏覽器內的直接操作編輯器" width="900">
  </a>
</p>

> **一份收據 JSON 進 → SVG、HTML、PNG 出。** 同一份資料、多種輸出 —— 還附上一個直接在收據上操作的編輯器。
> 為同人攤位、Comiket / 同人誌即賣會、手作市集、快閃店、在地優先的 POS 工具(例如 [OpenBooth](apps/openbooth-bridge))而生。

收據不一定要醜。對擺攤的創作者來說,收據是一個**品牌觸點** —— 一份客人會留著、會掃、會分享的小禮物。
`receipt-engine` 讓這件事變簡單,同時維持中立、可嵌入的函式庫:丟一份收據 JSON,拿回 PNG / SVG / HTML;
或直接把瀏覽器編輯器交給店家,讓他們自己設計。

## ✨ 亮點

- 🖌️ **直接操作編輯器** —— 點文字就改樣式、拖貼紙縮放旋轉、拖邊界改尺寸、拖區塊排序。全程在瀏覽器裡跑,手機也行。
- 📄 **一套 schema、多種輸出** —— SVG(主格式)· HTML · PNG,全部確定性渲染。
- 🎨 **主題** —— `custom`(彩色,可改色/字/貼紙)與 `thermal`(等寬、圖自動轉灰),也能用 `mergeTheme` 完全自訂。
- 🗂️ **8 個現成範本** —— 極簡 · 同人攤位 · 印刷所 zine · 咖啡店 · 手作市集 · 像素遊戲 · 精品手帳 · 夜間霓虹,各有字體、配色與個性;挑一個改,或從空白開始。
- 🪙 **任意幣別** —— 選代碼,或直接打你自己的符號(`NT$`、`¥`…),編輯器原樣顯示。
- ✶ **無邊框向量貼紙** —— 一組乾淨的實心圖示(零 emoji),在畫布上可縮放/旋轉。
- 🖨️ **熱感列印** —— ESC/POS raster(GS v 0)透過 **Web Bluetooth**,直接從瀏覽器印。
- 📲 **瀏覽器 PNG 與分享** —— 前端 canvas 轉 PNG,用 Web Share 傳給手機,免伺服器。
- 🌏 **多語** —— 編輯器 UI 內建 中文 / 日本語 / English。
- 🔗 **QR 條碼**、🔢 **自動金額計算**、🧱 **自訂區塊**、🧩 **React 元件** + **CLI** + 型別化核心 API。
- 🛡️ **安全且確定性** —— 每個使用者輸入都跳脫;收據不會上傳到伺服器。

## 🎨 主題

| 🎨 `custom` —— 彩色、可品牌化 | 🧾 `thermal` —— 收據機質感 |
|:---:|:---:|
| <img src="docs/assets/receipt-custom.png" alt="custom 主題" width="300"> | <img src="docs/assets/receipt-thermal.png" alt="thermal 主題" width="300"> |
| 顏色、字體、貼紙、LOGO、底圖(可縮放/旋轉)、QR。 | 等寬、黑白、鋸齒撕邊 —— 真正收據機印出來的樣子。 |

## 🚀 試用

**▶️ [打開線上編輯器](https://mimito-6.github.io/receipt-engine/)** —— 免安裝、免登入,手機也能用。
直接在收據上編輯範例,再下載 **PNG / SVG / HTML** 或存設定檔。

或在本機跑(pnpm monorepo,套件尚未發布到 npm):

```bash
pnpm install
pnpm build
pnpm test
# 然後用瀏覽器打開 apps/playground/public/index.html
```

<details>
<summary><b>編輯器能做什麼</b></summary>

- **從範本開始** → 8 個現成風格(或空白),再改成你的樣子。
- **點任何文字** → 跳出情境工具列,改內容、字體、顏色、大小、粗細(逐元素存進 `styleOverrides`);雙擊就地改字。
- **點貼紙** → PS 式變形框:四角縮放、上方旋轉、觸控雙指縮放旋轉;拖移時有對齊吸附。
- **拖卡片邊界** → 改寬度 / 上下留白。
- **拖一個區塊**(或用「版面順序」↑/↓ 面板)→ 重排版面(`blockOrder`)。
- 上傳 **LOGO / 底圖**(底圖可縮放、旋轉、透明),選 **顏色與字體**,切換 **透明** 背景 / 卡片 / QR 底色,
  切 `custom` / `thermal`,存讀設定檔,下載 **內嵌字體的 PNG**(匯出跟預覽一致)。

編輯器只改收據模型 —— 匯出維持確定性、不含編輯器中繼資料。
</details>

## 📦 套件

| 套件 | 用途 |
|------|------|
| `@receipt-engine/core` | Schema、驗證、正規化、金額計算。 |
| `@receipt-engine/themes` | 內建主題 + `getTheme` / `mergeTheme`。 |
| `@receipt-engine/render-svg` | 收據 → SVG 字串(主格式)。 |
| `@receipt-engine/render-html` | 收據 → 獨立 HTML。 |
| `@receipt-engine/render-png` | 收據 → PNG `Buffer`(resvg,伺服器端)。 |
| `@receipt-engine/bitmap` | 熱感印表機用的 1-bit 抖色 + 位元打包。 |
| `@receipt-engine/escpos` | ESC/POS 指令 + raster 輸出(GS v 0)。 |
| `@receipt-engine/connect` | 瀏覽器交付:Web Bluetooth 熱感列印、canvas PNG、Web Share。 |
| `@receipt-engine/import` | POS / 訂單 → 收據轉接(含 OpenBooth)+ 版型套用。 |
| `@receipt-engine/react` | `<ReceiptCard />`。 |
| `@receipt-engine/cli` | `receipt-engine render …`。 |

**Apps:** [`apps/playground`](apps/playground) —— 上面部署的瀏覽器編輯器 ·
[`apps/openbooth-bridge`](apps/openbooth-bridge) —— OpenBooth ⇄ receipt-engine 整合 bundle。

## 🧑‍💻 當作函式庫使用

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
# 在 repo 內用 dev 腳本執行:
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme custom --format svg --out receipt.svg

# build 完之後,bin 就可用:
receipt-engine render receipt.json --theme custom --format png --out receipt.png
```

選項:`--theme custom|thermal`、`--format svg|html|png`、`--out <path>`、`--width <number>`、`--pretty`。
省略 `--out` 時,`svg`/`html` 會印到 stdout。
</details>

## 📄 收據 JSON

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
  "discounts": [{ "label": "套組優惠", "amount": 50 }],
  "payments": [{ "method": "現金", "amount": 700 }],
  "qr": { "value": "https://instagram.com/mimito.art", "label": "追蹤我們" },
  "message": { "title": "Thank you!", "body": "感謝支持我們的攤位!" }
}
```

完整欄位說明見 [`docs/schema.md`](docs/schema.md)。現成範例在 [`examples/`](examples)(`simple`、`cute-booth`、`openbooth-like`)。

## 📱 在手機上用

渲染路徑都是**純前端 JavaScript** —— SVG、HTML、**PNG(canvas,透過 `@receipt-engine/connect`)** 全部直接在
手機瀏覽器裡跑,免伺服器。playground 就是這樣在手機上渲染、匯出 PNG,甚至 **透過 Web Bluetooth 熱感列印**。
(`@receipt-engine/render-png` 是另一條伺服器端 PNG 路徑,用原生模組,給批次 / Node 用。)

最簡單的用法:在手機上 **[打開部署好的編輯器](https://mimito-6.github.io/receipt-engine/)**。
要嵌進自己的 App(React Native / WebView),直接 import `@receipt-engine/render-svg` 或 `@receipt-engine/render-html`。

## 📚 文件

[Schema](docs/schema.md) · [主題](docs/themes.md) · [渲染](docs/rendering.md) · [路線圖](docs/roadmap.md)

## 🗺️ 路線圖

**已出貨(v0.1)** 瀏覽器編輯器 · 瀏覽器 PNG 匯出 · ESC/POS 熱感列印(Web Bluetooth)· OpenBooth 整合 · 中/日/英多語。
**接下來** 託管收據頁 · 優惠 QR · 社群主題 · 外掛系統。完整清單見 [`docs/roadmap.md`](docs/roadmap.md)。

## 📜 授權

[MIT](LICENSE) © mimito
