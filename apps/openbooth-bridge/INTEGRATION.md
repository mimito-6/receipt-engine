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
         ├─ 🖨 thermal SVG(384) → 1-bpp → ESC/POS GS v 0 → Web Bluetooth printer
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
- **Thermal print** needs **Web Bluetooth** → Android Chrome/Edge. iOS/Safari has
  no Web Bluetooth, so on iPhone the print button can't reach a BLE printer; the
  **share** path works everywhere (iOS Safari 15+ included). For iPhone printing
  you'd wrap OpenBooth in a native shell (Capacitor + a BLE plugin) — out of scope
  for v1.
- **Printers**: targets generic 58/80mm ESC/POS BLE printers (`GS v 0` raster).
  Cat-printers / some Phomemo models use a custom BLE packet protocol and aren't
  covered yet.
- Set print width via `dots` (384 for 58mm, 576 for 80mm) — the glue uses 384.

## Try it now

```bash
pnpm --filter @receipt-engine/openbooth-bridge build
# serve apps/openbooth-bridge/public and open test-harness.html, tap 模擬結帳
```
