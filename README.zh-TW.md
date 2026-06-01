# receipt-engine

[English](README.md) · **繁體中文** · [日本語](README.ja.md)

把收據變好看。

`receipt-engine` 是一個開源工具:你給它一筆消費資料,它就幫你產生一張漂亮、可以分享、也能列印的收據。可以是手機上看的圖、一頁網頁,或是一張 PNG 圖檔,未來還能接收據機列印。

適合:小店、攤位收銀、創作者擺攤(像同人場、動漫場的個人攤位)、手作市集、快閃店,以及那種「不一定要連網路也能用」的收銀工具。

> 給它一筆資料,一次產出「圖、網頁、圖檔」三種收據。

---

## 這是要解決什麼

收據不一定要醜。對在同人場或手作市集擺攤的人來說,一張用心的收據,其實是你跟客人之間的一個小連結——一份客人會留著、會拍照、會分享出去的小東西。

`receipt-engine` 讓做出這種收據變得很簡單;而且它是一個獨立的小工具,可以被你自己的程式或收銀系統直接拿去用。舉例:之後接到像 OpenBooth 這種「不連網也能用的收銀 App」時,你只要把一筆收據資料丟進去,它就回給你圖、網頁或圖檔。

## 它能做什麼

- 📄 **一份資料,三種輸出**:手機/網頁看的向量圖(SVG)、可直接打開的整頁網頁(HTML)、圖檔(PNG)。
- 🎨 **三種現成風格**:`簡約`、`可愛`、`收據機`(黑白窄條那種)。也能自己換顏色、字體。
- 🧱 **可自由加區塊**:加一段文字、一張圖、一條分隔線,或一個 QR code。
- 🔢 **金額自動算**:小計、折扣、稅、找零都幫你算好,不用自己加。
- 🔗 **QR code**:可以連到你的數位收據、社群、優惠券或回饋表單。
- 🧩 給工程師的:現成的網頁元件(React)、命令列工具,還有完整型別的程式介面。
- 🛡️ **安全又穩定**:客人打的字會自動處理特殊符號,不會弄壞畫面;不連網、不偷抓你的字型;同一筆資料每次產生的結果都一模一樣。
- 📱 **手機友善**:做圖和網頁這件事可以直接在手機瀏覽器裡跑(見下方「在手機上用」)。

## 先試玩看看(不用寫程式)

想先看效果,最快的方法:

1. 先照下面「在本機跑起來」做 `pnpm install` 和 `pnpm build`。
2. 用瀏覽器直接打開 `apps/playground/public/index.html`。
3. 左邊即時預覽收據,右邊改資料、上面換風格,還能直接下載。

整個頁面都在你自己的瀏覽器裡跑,不會上傳任何東西,**手機也能開**。

## 在本機跑起來

需要 [Node.js](https://nodejs.org/) 18 以上和 [pnpm](https://pnpm.io/)。

```bash
pnpm install   # 第一次先安裝
pnpm build     # 建置
pnpm test      # 跑測試(可選)
```

接著三種試法,挑一個:

**A. 開試玩網頁**(最直覺):用瀏覽器打開 `apps/playground/public/index.html`。

**B. 用一行指令產生一張收據**:

```bash
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format png --out receipt.png
```

把 `--format` 換成 `svg` 或 `html` 也可以。Windows 下產生 `.html` 後,用 `start receipt.html` 就能開來看。

**C. 一次產生全部範例圖**:`pnpm samples`(圖會放到 `samples/` 資料夾,共 3 個範例 × 3 種風格)。

## 在手機上用

先把目前的狀況講清楚,避免誤會:

- 這個專案本身是「工具/函式庫 + 命令列」,它跑在**電腦或伺服器**上,不是一個你直接裝在手機上的 App。
- 但是它「產生向量圖(SVG)」和「產生網頁(HTML)」的功能是**純前端**的——也就是說,這段程式可以直接在**手機的瀏覽器裡**跑,不需要伺服器。
- 只有「產生 PNG 圖檔」目前需要在電腦/伺服器端做(用到一個原生套件)。未來 v0.2 會換成可以在瀏覽器裡跑的版本(`@resvg/resvg-wasm`),到時候手機端也能直接出 PNG。

所以「在手機上用」實際上有三條路:

1. **最推薦**:把 `apps/playground/public` 這個資料夾(就一個 HTML + 一個 `.js`)丟到任何免費靜態網站空間(GitHub Pages、Netlify、Vercel 都行),用手機開那個網址,就能在手機上即時做收據、下載圖。
2. **同一個 Wi-Fi 臨時試**:在電腦上跑一個靜態伺服器,手機連「電腦的 IP:埠號」。
3. **只是要看結果**:用上面的指令產生 PNG/HTML,把檔案傳到手機(或貼到聊天室、Email),手機本來就能開圖和網頁。

想把渲染包進你自己的手機 App(React Native / WebView)也行:`@receipt-engine/render-svg`、`@receipt-engine/render-html` 沒有任何「只能在電腦跑」的相依,直接 import 就能在手機端產生收據。

## 各個套件在做什麼

| 套件 | 做的事 |
|------|--------|
| `@receipt-engine/core` | 收據資料的「規格 + 檢查 + 自動算錢」。 |
| `@receipt-engine/themes` | 三種內建風格,以及換風格的工具。 |
| `@receipt-engine/render-svg` | 把收據畫成向量圖(主要的渲染器)。 |
| `@receipt-engine/render-html` | 把收據包成一頁可直接打開的網頁。 |
| `@receipt-engine/render-png` | 把收據轉成 PNG 圖檔。 |
| `@receipt-engine/react` | 現成的網頁元件 `<ReceiptCard />`。 |
| `@receipt-engine/cli` | 命令列工具:一行指令把收據檔變成圖。 |
| `@receipt-engine/playground` | 純前端試玩網頁(手機可開)。 |

## 給工程師:命令列

```bash
receipt-engine render receipt.json --theme cute --format png --out receipt.png
```

選項:`--theme minimal|cute|thermal`、`--format svg|html|png`、`--out <檔名>`、
`--width <數字>`、`--pretty`。沒給 `--out` 時,`svg`/`html` 會直接印在畫面上。

## 給工程師:程式介面

```ts
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToPng } from '@receipt-engine/render-png'

const svg = renderReceiptToSvg(receipt, { theme: 'cute', width: 720 })
const png = await renderReceiptToPng(receipt, { theme: 'cute', pixelRatio: 2 })
```

## 給工程師:React

```tsx
import { ReceiptCard } from '@receipt-engine/react'

export function App() {
  return <ReceiptCard receipt={receipt} theme="cute" width={360} />
}
```

## 收據資料長這樣

```jsonc
{
  "schemaVersion": "0.1",
  "currency": "TWD",
  "merchant": { "name": "Mimito Booth", "subtitle": "手作 × 插畫 × 小誌", "icon": "🎀" },
  "event": { "name": "Artist Alley", "boothNumber": "A12" },
  "transaction": { "receiptNo": "AA-A12-018", "issuedAt": "2026-06-01T14:30:00+08:00" },
  "items": [
    { "name": "Sticker Set", "quantity": 2, "unitPrice": 120, "tags": ["新刊"] },
    { "name": "Mini Zine", "quantity": 1, "unitPrice": 180, "tags": ["特典"] }
  ],
  "discounts": [{ "label": "套組優惠", "amount": 50 }],
  "payments": [{ "method": "Cash", "amount": 700 }],
  "qr": { "value": "https://instagram.com/mimito.art", "label": "追蹤我們" },
  "message": { "title": "Thank you! ♡", "body": "感謝支持我們的攤位!" }
}
```

每個欄位的詳細說明看 [`docs/schema.md`](docs/schema.md);完整範例在
[`examples/`](examples) 資料夾(`simple`、`cute-booth`、`openbooth-like`)。

## 換顏色 / 自訂風格

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

// 以「簡約」為底,只改主色
const theme = mergeTheme(getTheme('minimal'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme })
```

## 文件

- [收據資料規格](docs/schema.md)
- [風格主題](docs/themes.md)
- [渲染說明](docs/rendering.md)
- [開發藍圖](docs/roadmap.md)

## 開發藍圖(精簡)

**v0.2** 風格調整工具、手機/瀏覽器端直接出 PNG · **v0.3** 收據機列印(ESC/POS)與
58/80mm 版面 · **v0.4** 線上收據頁、優惠券 QR、社群風格庫 · **v0.5** 外掛系統。
完整清單見 [`docs/roadmap.md`](docs/roadmap.md)。

## 授權

[MIT](LICENSE) © mimito
