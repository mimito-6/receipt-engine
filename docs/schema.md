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
| `styleOverrides` | `Record<string, TextStyle>` | | Per-element style overrides, keyed by element id. |
| `blockOrder` | BlockKey[] | | Override the top-to-bottom order of the major sections. |

## Style overrides

`styleOverrides` lets any individual text element be restyled, keyed by a stable
**element id** (the same id the editor uses for hit-testing). `TextStyle` =
`{ fontFamily?, color?, size?, weight?, align? }`. Example ids: `merchant.name`,
`merchant.subtitle`, `items.0.name`, `items.0.price`, `totals.subtotal`,
`totals.total`, `qr.label`, `qr.caption`, `message.title`, `message.body`,
`message.footer`. Overrides merge over the theme defaults and are applied on every
output (SVG / HTML / PNG), so they travel with the receipt.

## Block order

`blockOrder` is an array of layout-unit keys controlling top-to-bottom order.
The units are fine-grained so each can be reordered independently:
`'logo' | 'name' | 'subtitle' | 'event' | 'body' | 'customBlocks' | 'qrImage' |
'qrLabel' | 'qrCaption' | 'messageTitle' | 'messageBody' | 'messageFooter' |
'footerImage'`. `body` groups transaction + items + discounts + totals + payments.
Any omitted keys are appended in the default order, so a partial list reorders
without dropping content. Legacy coarse keys (`header`, `transaction`, `items`,
`discounts`, `totals`, `payments`, `qr`, `message`) from older saved configs are
still accepted and expanded to the units above.

## Merchant

`name`, `subtitle`, `logo`, `icon`, `address`, `website`,
`socials: { label, url }[]` — all optional.

- `name` — **optional**. Leave it empty to brand with the logo alone; no name
  text (and no empty name block) is drawn.
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

- `footerImage` — image drawn at the bottom of the receipt.
- `backgroundImage` — image drawn behind the content (clipped to the card).
- `backgroundOpacity` — `0`–`1` (default `1`).
- `backgroundScale` — multiplier over the card's cover size (default `1`).
- `backgroundX`, `backgroundY` — background offset in px.

Under the `thermal` theme the background image is rendered in black & white too.

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
