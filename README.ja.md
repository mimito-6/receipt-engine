# receipt-engine

[English](README.md) · [繁體中文](README.zh-TW.md) · **日本語**

レシートを、もっと楽しく。

`receipt-engine` は、構造化されたレシート JSON を美しく共有・印刷できるレシートに変換するオープンソースのレンダリングエンジンです。ブランド化されたデジタルレシートカード、SVG/HTML プレビュー、PNG 画像、そして将来的にはサーマルプリンター出力に対応します。

POS アプリ、アーティストアレー、同人イベント、クラフトマーケット、ポップアップストア、ローカルファーストなコマースツール向けに設計されています。

> 1 つのレシート JSON から → SVG・HTML・PNG へ。同じデータを、さまざまな形で。

---

## なぜ作ったか

レシートが味気ない必要はありません。アーティストアレーのクリエイターやクラフトマーケットの出店者にとって、レシートは**ブランドとの接点**です——お客さんが手元に残し、スキャンし、シェアする小さなギフト。`receipt-engine` はそれを簡単にしながら、中立的で組み込み可能なライブラリであり続けます(例:OpenBooth のようなオフラインファースト POS に組み込み、レシート JSON を渡すだけで PNG / SVG / HTML が返ってきます)。

## 特徴

- 📄 **1 つのスキーマ、複数の出力** — SVG(正本)、HTML、PNG。
- 🎨 **テーマ** — `minimal`、`cute`、`thermal`、さらに完全なカスタムテーマ。
- 🧱 **カスタムブロック** — text・image・divider・QR を、合計とメッセージの間に描画。
- 🔢 **スマートな合計計算** — 小計・割引・税・支払い・釣り銭を自動計算。
- 🔗 **QR コード** — デジタルレシート、SNS、クーポン、フィードバックのリンクに。
- 🧩 **React コンポーネント** + **CLI** + 型付きの core API。
- 🛡️ **安全で決定的** — すべての値をエスケープ。ネットワーク通信もフォント取得もしません。
- 📱 **モバイル対応** — SVG/HTML はどこでも動作。PNG は WASM 化可能なエンジンで生成。

## パッケージ

| パッケージ | 役割 |
|-----------|------|
| `@receipt-engine/core` | スキーマ、検証、正規化、合計。 |
| `@receipt-engine/themes` | 組み込みテーマ + `getTheme` / `mergeTheme`。 |
| `@receipt-engine/render-svg` | レシート → SVG 文字列(正本)。 |
| `@receipt-engine/render-html` | レシート → 単体の HTML。 |
| `@receipt-engine/render-png` | レシート → PNG `Buffer`(resvg)。 |
| `@receipt-engine/react` | `<ReceiptCard />`。 |
| `@receipt-engine/cli` | `receipt-engine render …`。 |

## インストール(開発)

これは pnpm モノレポです。パッケージはまだ npm に公開していません——clone してビルドしてください:

```bash
pnpm install
pnpm build
pnpm test
```

## CLI

```bash
# リポジトリ内では、CLI は dev スクリプト経由で実行します:
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format svg  --out receipt.svg
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format html --out receipt.html
pnpm --filter @receipt-engine/cli dev render examples/cute-booth/receipt.json --theme cute --format png  --out receipt.png
```

ビルド後は `receipt-engine` コマンドが使えます:

```bash
receipt-engine render receipt.json --theme cute --format png --out receipt.png
```

オプション:`--theme minimal|cute|thermal`、`--format svg|html|png`、`--out <path>`、
`--width <number>`、`--pretty`。`--out` を省略すると `svg`/`html` は標準出力に出力されます。

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

## レシート JSON

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

全フィールドの仕様は [`docs/schema.md`](docs/schema.md) を、サンプルは
[`examples/`](examples) フォルダ(`simple`・`cute-booth`・`openbooth-like`)を参照してください。

## テーマのカスタマイズ

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const theme = mergeTheme(getTheme('minimal'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme })
```

## サンプル画像の生成

```bash
pnpm build
pnpm samples   # samples/<example>-<theme>.{svg,png} を出力
```

## ドキュメント

- [Schema](docs/schema.md)
- [Themes](docs/themes.md)
- [Rendering](docs/rendering.md)
- [Roadmap](docs/roadmap.md)

## ロードマップ(概要)

**v0.2** テーマプレイグラウンド、ブラウザでの PNG 書き出し · **v0.3** ESC/POS と
58/80mm サーマル · **v0.4** ホスト型レシートページ、クーポン QR、コミュニティテーマ ·
**v0.5** プラグインシステム。詳細は [`docs/roadmap.md`](docs/roadmap.md) を参照。

## ライセンス

[MIT](LICENSE) © mimito
