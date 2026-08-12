# Roadmap

## Shipped

### v0.1 ✅

- Receipt schema + validation
- SVG renderer (canonical) + HTML renderer + server-side PNG renderer (resvg)
- Themes (`custom`, `thermal`) + per-element style overrides + block reordering
- Stickers (emoji / image overlays); torn "receipt-machine" edges; B&W image filter
- In-browser direct-manipulation editor (playground): tap-to-style, drag/resize/reorder,
  PNG export with embedded fonts, clean/transparent export, config save & restore, zh/ja/en i18n
- Browser-side PNG export (canvas) + Web Share — runs on a phone, no server
- ESC/POS raster output (GS v 0) + 1-bit dithering + Web Bluetooth thermal printing
- OpenBooth (Boothレジ) integration bridge
- React component + CLI + examples

### v0.3 — thermal presets & tuning ✅ (landed ahead of v0.2)

- Paper profiles in `@receipt-engine/core`: `PAPER_58` (58mm, 384 dots, 48 bytes/row) and
  `PAPER_80` (80mm, 576 dots, 72 bytes/row), plus `getPaperProfile(id)`. `RenderSvgOptions.paper`
  lays the receipt out *natively* at the profile's dot width (margins, side padding, QR and logo
  boxes all come from the profile) instead of upscaling a 384-dot raster.
- Printer profiles in `@receipt-engine/connect`: `gprinter-ble-80`, `generic-58`, `generic-80` —
  each carrying its GATT service hints, paper profile, default BLE pacing, cutter capability,
  post-print feed and (where measured) its maximum GATT write size.
- Test-print mode: a plain-ASCII self test in the editor's print panel (48 bytes, no raster),
  a length / ink-coverage estimate that never touches Bluetooth, and a standalone BLE bench at
  `apps/playground/public/print-test.html`.
- Image-processing modes for 1-bit output (`@receipt-engine/bitmap`): hybrid, halftone screening
  with five spot shapes, hard threshold, and full error diffusion — see
  [the playground's print panel](../apps/playground/README.md#thermal-printing-over-bluetooth-ble).
- `renderReceiptWithMetadata` / `receiptMetadata`: dots, mm, bytes per row, and receipts per roll.
- Byte-saving transfer path in `@receipt-engine/escpos`: runs of blank rows become an `ESC J`
  feed instead of transmitted raster, and `feedAfterPrintMm` is emitted as resolution-exact
  dot feeds.
- Print settings (printer, paper, pacing, image mode, threshold, artwork density, feed) are
  saved into and restored from the editor's config file.

## Planned

### v0.2

- More card templates + preset themes for creator booths
- Better image handling (crop / fit modes)
- Optional `@resvg/resvg-wasm` PNG path (higher fidelity than the canvas export)

### v0.4

- Hosted receipt page mode
- QR-powered digital receipt sharing
- Coupon / revisit QR blocks
- Community theme gallery

### v0.5

- Plugin system
- Custom block plugins
- Template marketplace / community registry
