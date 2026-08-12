# OpenBooth ⇄ receipt-engine integration

Connect [OpenBooth](https://github.com/mimito-6/openbooth) (Boothレジ) checkout to
receipt-engine: when a sale completes, render the merchant's configured receipt
and either **print it to a portable thermal printer over Web Bluetooth** or
**share the image to the customer's phone**. Everything runs in the browser — no
server, matching OpenBooth's offline-first design.

```
OpenBooth complete(savedTx)
  └─ OB.receipt.handle(savedTx)
       importOpenBoothOrder(tx, {settings, event})   → ReceiptDocument (order data)
       applyTemplate(doc, savedDesign)               → merged (your design)
       renderReceiptToSvg(...)
         ├─ 🖨 thermal SVG → 1-bpp → ESC/POS GS v 0 → Web Bluetooth printer
         └─ 📲 custom SVG → PNG → navigator.share({files}) → customer's phone
```

## What you get

- `public/openbooth-receipt-bridge.global.js` — one bundle that exposes
  `window.ReceiptBridge` (rendering + the OpenBooth order adapter + Web Bluetooth /
  Web Share delivery). Build it with
  `pnpm --filter @receipt-engine/openbooth-bridge build`.
- `public/openbooth-receipt.js` — the `OB.receipt` glue (self-contained UI:
  a receipt sheet with print / share, plus a settings sheet to pair the printer
  and import a design template). Only needs `window.ReceiptBridge` and
  `window.OB.store`.
- `public/test-harness.html` — a standalone page that fakes `OB.store` + a sample
  transaction so you can try the whole flow without OpenBooth.

## Wire it into OpenBooth (3 steps)

1. **Copy** both files into `booth-pos/`:
   - `openbooth-receipt-bridge.global.js`
   - `openbooth-receipt.js`

2. **Load** them in `booth-pos/index.html`, after `js/store.js`:

   ```html
   <script src="openbooth-receipt-bridge.global.js"></script>
   <script src="openbooth-receipt.js"></script>
   ```

   (If using the service worker `sw.js`, add both files to its precache list.)

3. **Hook checkout** in `booth-pos/js/views/front.js`, inside `complete(s)`,
   right after the transaction is committed:

   ```js
   const savedTx = OB.store.addTransaction(tx);
   if (window.OB && OB.receipt) OB.receipt.handle(savedTx); // ← add this line
   ```

That's it. Every completed sale now opens the receipt sheet.

## Configure the look (once)

The receipt's **design** (theme, fonts, colors, padding, thank-you message, QR,
per-element styles, block order, stickers) comes from a template you design in the
**receipt-engine playground** (`apps/playground`):

1. Open the playground, design your receipt, and click **下載設定檔** (download the
   config JSON).
2. In OpenBooth, tap **⚙ 收據設定 → ⬆ 匯入版型設定檔** and pick that JSON.

The template stores a look for **both** themes, so the thermal **print** uses your
black-&-white `thermal` design and the phone **share** uses your colorful `custom`
design. The order data (shop name, items, totals, payment, change) always comes
from OpenBooth and reconciles to its figures.

Optional settings: **🔗 配對 / 連線收據機** (pair the printer once) and
**結帳後自動列印** (auto-print on checkout).

### Fonts

So the print/share output matches your designed typeface (not a system fallback),
the glue embeds the fonts the receipt uses into the SVG before rasterizing
(`ReceiptBridge.buildFontFaceCss`). **Google fonts** (Quicksand, Nunito, Baloo 2,
Poppins, Fredoka, Space Mono, Noto Sans TC) are fetched online and subsetted to
the exact glyphs used (tiny, even for CJK) — no files to copy. To also embed the
bundled **pixel fonts** (Cubic 11, Boutique 9×9), copy `apps/playground/public/fonts/*.ttf`
into `booth-pos/fonts/`. Anything that can't be fetched (offline, or Sarasa)
gracefully falls back.

## Requirements & limits

- **HTTPS** (or `localhost`) is required for both Web Bluetooth and Web Share, and
  both need a user tap (the sheet buttons provide that).
- **Thermal print** needs **Web Bluetooth** → Chrome/Edge, on Android **and on desktop**
  (Windows/macOS/Linux with BLE hardware). iOS/Safari has
  no Web Bluetooth, so on iPhone the print button can't reach a BLE printer; the
  **share** path works everywhere (iOS Safari 15+ included). For iPhone printing
  you'd wrap OpenBooth in a native shell (Capacitor + a BLE plugin) — out of scope
  for v1.
- **Printers**: targets generic 58/80mm ESC/POS BLE printers (`GS v 0` raster).
  Cat-printers / some Phomemo models use a custom BLE packet protocol and aren't
  covered yet.
- **Paper is a profile, not a number.** Pass `PAPER_58` (384 dots) or `PAPER_80` (576 dots)
  and every downstream dimension follows it — SVG width, padding, wrapping, QR and logo size,
  raster bytes per row, and the ESC/POS width bytes. Do not hardcode a dot count.

## Bridge API (v0.2.0)

Everything below hangs off `window.ReceiptBridge`. Nothing was removed in 0.2.0 — 0.1.x
callers keep working — but the whole 80mm path, the printer profiles and the one-call print
façade were previously unreachable from OpenBooth, which is why the integration was pinned to
58mm.

### The short path

```js
const { preview, escposBytes, metadata } = await ReceiptBridge.renderReceipt(receipt, {
  printer: ReceiptBridge.GPRINTER_BLE_80,   // 80mm, no cutter, measured 180-byte write ceiling
})
// preview      — SVG string, for the on-screen confirmation
// escposBytes  — Uint8Array, ready to write
// metadata     — { widthDots, heightDots, dpi, estimatedLengthMm, estimatedReceiptsPerRoll, … }

const printer = new ReceiptBridge.Printer({ profile: ReceiptBridge.GPRINTER_BLE_80 })
await printer.connect()          // must be called from a user gesture
await printer.print(escposBytes) // resolves only when every byte is acknowledged
```

The caller never needs to know about `GS v 0`, rasterization or 1-bit conversion.

### Profiles

| Export | Paper | Notes |
| --- | --- | --- |
| `GPRINTER_BLE_80` | 80mm / 576 dots | The tested device. No cutter; 20mm feed so the receipt clears the tear bar. Measured maximum GATT write: **180 bytes** — larger packets are refused. |
| `GENERIC_BLE_80` | 80mm / 576 dots | Unknown device, conservative pacing. |
| `GENERIC_BLE_58` | 58mm / 384 dots | Unknown device, conservative pacing. |

`getPrinterProfile(id)` looks one up by id; `TRANSMISSION_MODES` / `getTransmissionMode()`
expose the pacing table.

### Image quality

`renderReceipt` accepts `bitmap` options, defaulting to `hybrid` — solid ink stays solid,
bare paper stays bare, and only the mid-tones between them are dithered, so type prints crisp
while artwork survives. Thermal paper has no grey, so this is the only real choice available:

- `{ dither: 'hybrid' }` — the default. Best for a receipt that mixes type and artwork.
- `{ dither: 'halftone', spot: 'round' | 'diamond' | 'line' | 'heart' | 'star' }` — newsprint-
  style screening. Clustered dots burn more solidly on a thermal head than scattered ones, and
  the spot shape is a design choice.
- `{ dither: 'none', threshold }` — hard threshold. Cleanest for pure type; erases faint art.
- `{ dither: 'floyd-steinberg' }` — full error diffusion. For photographs; greys out type.

`inkFloor` / `paperCeil` move the boundaries of the untouched-ink and untouched-paper bands.

### Measuring before printing

`renderReceiptWithMetadata()` and `receiptMetadata()` report `estimatedLengthMm` and
`estimatedReceiptsPerRoll` for a 20m roll, so a POS can warn before it runs out of paper.

## Try it now

```bash
pnpm --filter @receipt-engine/openbooth-bridge build
# serve apps/openbooth-bridge/public and open test-harness.html, tap 模擬結帳
```
