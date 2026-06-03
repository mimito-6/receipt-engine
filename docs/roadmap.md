# Roadmap

## v0.1 ✅ (current)

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

## v0.2

- More card templates + preset themes for creator booths
- Better image handling (crop / fit modes)
- Optional `@resvg/resvg-wasm` PNG path (higher fidelity than the canvas export)

## v0.3

- 58mm / 80mm thermal layout presets + tuning
- Test-print mode + more printer profiles
- (core ESC/POS output + Web Bluetooth printing already shipped in v0.1)

## v0.4

- Hosted receipt page mode
- QR-powered digital receipt sharing
- Coupon / revisit QR blocks
- Community theme gallery

## v0.5

- Plugin system
- Custom block plugins
- Template marketplace / community registry
