# Receipt JSON Schema (v0.1)

A receipt document is a single JSON object validated by `@receipt-engine/core`
(built on [Zod](https://zod.dev)). `schemaVersion` must be `"0.1"`.

```ts
import { validateReceipt } from '@receipt-engine/core'
const receipt = validateReceipt(json) // throws ReceiptValidationError on failure
```

## Root

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schemaVersion` | `"0.1"` | ✅ | Literal. |
| `id` | string | | Your own identifier. |
| `locale` | string | | Used as the HTML `lang`. |
| `currency` | string | ✅ | ISO code, e.g. `TWD`, `USD`, `JPY`. |
| `merchant` | Merchant | ✅ | |
| `event` | Event | | Booth / market context. |
| `transaction` | Transaction | ✅ | |
| `items` | Item[] | ✅ | |
| `discounts` | Discount[] | | |
| `payments` | Payment[] | | |
| `totals` | Totals | | Auto-computed when omitted. |
| `qr` | Qr | | |
| `message` | Message | | Thank-you note. |
| `assets` | Assets | | Footer / background images. |
| `customBlocks` | CustomBlock[] | | Rendered between totals and message. |
| `stickers` | Sticker[] | | Emoji / image overlays drawn on top of everything. |

## Merchant

`name` (required), `subtitle`, `logo`, `icon`, `address`, `website`,
`socials: { label, url }[]`.

- `logo` — URL, data URI, or relative path (rendered as an image).
- `icon` — emoji **or** an image source. Emoji is drawn as text; image sources
  are drawn as an `<image>`.

> Under the `thermal` theme, every embedded image (logo, icon, footer, sticker)
> is rendered in black & white via a grayscale SVG filter. The `custom` theme
> keeps images in color.

## Event

`name`, `boothName`, `boothNumber`, `location`, `date` — all optional. For
CWT / FF / Comiket / artist alley / zine fairs / craft markets / pop-ups.

## Transaction

`receiptNo` (required), `issuedAt` (required, ISO 8601), `cashier`, `note`.

## Item

`name` (required), `quantity` (> 0), `unitPrice` (≥ 0), and optional `id`,
`variant`, `sku`, `subtotal`, `note`, `image`, `tags`.

- `subtotal` defaults to `quantity * unitPrice`.
- `tags` render as small badges (e.g. `新刊`, `特典`, `預購`) when the theme
  enables `showItemBadges`.

## Discount

`label` (required), `amount` (positive). Rendered as a negative line.

## Payment

`method` (required), `amount` (required), `reference`.

## Totals

All optional and auto-derived when absent:

- `subtotal` = Σ item subtotals
- `discountTotal` = Σ discounts
- `total` = subtotal − discountTotal + taxTotal + serviceFee
- `paid` = Σ payments
- `change` = paid − total

Explicit values always override the computed ones.

## QR

`value` (required), `label`, `caption`. Use it for a digital receipt page,
brand page, social link, next-visit coupon, feedback form, or product page.

## Message

`title`, `body`, `footer` — all optional.

## Assets

`footerImage`, `backgroundImage`.

## Custom blocks

A discriminated union on `type`:

```jsonc
{ "type": "text",    "text": "…", "align": "left|center|right" }
{ "type": "image",   "src": "…", "alt": "…", "width": 120, "height": 120 }
{ "type": "divider", "label": "♡" }
{ "type": "qr",      "value": "…", "label": "…", "caption": "…" }
```

## Stickers

Top-level `stickers: Sticker[]` — playful overlays drawn on top of everything
else (logos, photos, emoji). Each sticker:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `content` | string | ✅ | An emoji **or** an image source (URL / data URI). |
| `x` | number | | Horizontal offset. |
| `y` | number | | Vertical offset. |
| `size` | number | | Rendered size. |
| `rotation` | number | | Rotation in degrees. |
| `anchor` | `'logo' \| 'header' \| 'footer' \| 'free'` | | Where the sticker attaches; `'free'` positions by `x`/`y` alone. |

Image stickers, like every other embedded image, are rendered in black & white
under the `thermal` theme and in color under `custom`.
