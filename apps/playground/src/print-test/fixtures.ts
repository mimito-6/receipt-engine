// Test payloads for the BLE print bench: three receipts plus a synthetic raster
// pattern used to prove the print head is really using all 576 (or 384) dots.
import type { ReceiptDocument } from '@receipt-engine/core'
import type { Bitmap1bpp } from '@receipt-engine/escpos'

const ISSUED_AT = '2026-06-01T14:30'

/**
 * The standard test receipt: mixed 中文 / English, several items with qty × unit price,
 * a discount, totals, cash payment, a QR code, dividers and a footer — i.e. every block
 * a real receipt exercises, so one print validates the whole layout path.
 */
export function testReceipt(): ReceiptDocument {
  return {
    schemaVersion: '0.1',
    locale: 'zh-TW',
    currency: 'TWD',
    merchant: { name: 'OpenBooth 測試商店', subtitle: 'BLE Print Test · 熱感列印測試' },
    transaction: { receiptNo: 'TEST-0001', issuedAt: ISSUED_AT, cashier: 'Demo' },
    items: [
      { name: '壓克力吊飾 Acrylic Charm', quantity: 2, unitPrice: 60 },
      { name: '貼紙組 Sticker Set', quantity: 1, unitPrice: 80 },
      { name: '明信片 Postcard', variant: 'A6', quantity: 3, unitPrice: 50 },
      { name: '小誌 Mini Zine', variant: '24p', quantity: 1, unitPrice: 120 },
    ],
    discounts: [{ label: '套組優惠 Set deal', amount: 30 }],
    payments: [{ method: 'Cash 現金', amount: 500 }],
    qr: { value: 'https://github.com/mimito-6/receipt-engine', label: 'receipt-engine' },
    message: {
      title: 'Thank you!',
      body: '謝謝您的購買,期待下次見面。',
      footer: 'BLE / ESC/POS test print',
    },
  } as ReceiptDocument
}

/** A deliberately long receipt: exercises multi-band GS v 0 output and paper estimates. */
export function longReceipt(): ReceiptDocument {
  const items = Array.from({ length: 24 }, (_, i) => ({
    name: `測試商品 Test Item ${String(i + 1).padStart(2, '0')}`,
    variant: i % 3 === 0 ? '限定 Limited' : undefined,
    quantity: (i % 4) + 1,
    unitPrice: 40 + (i % 7) * 15,
  }))
  return {
    schemaVersion: '0.1',
    locale: 'zh-TW',
    currency: 'TWD',
    merchant: { name: 'OpenBooth 測試商店', subtitle: 'Long receipt · 長收據測試' },
    transaction: { receiptNo: 'TEST-LONG-0002', issuedAt: ISSUED_AT, cashier: 'Demo' },
    items,
    discounts: [{ label: '滿額折扣 Bulk discount', amount: 120 }],
    payments: [{ method: 'Cash 現金', amount: 5000 }],
    message: { title: 'Thank you!', footer: 'End of long receipt' },
  } as ReceiptDocument
}

/** QR-focused receipt: checks the code survives 1-bpp thresholding and still scans. */
export function qrReceipt(): ReceiptDocument {
  return {
    schemaVersion: '0.1',
    locale: 'zh-TW',
    currency: 'TWD',
    merchant: { name: 'QR TEST', subtitle: 'scan me 掃描測試' },
    transaction: { receiptNo: 'TEST-QR-0003', issuedAt: ISSUED_AT },
    items: [{ name: 'QR readability check', quantity: 1, unitPrice: 1 }],
    qr: {
      value: 'https://github.com/mimito-6/receipt-engine',
      label: 'scan to open',
      caption: '若掃不到,請調高門檻或改用抖色',
    },
    message: { footer: 'QR test' },
  } as ReceiptDocument
}

// ---------------------------------------------------------------------------
// Raster alignment pattern
// ---------------------------------------------------------------------------

/**
 * A synthetic 1-bpp pattern that proves the print head uses the FULL width.
 *
 * Built as raw bits rather than rendered from SVG on purpose: it puts an exact dot at
 * column 0 and column width-1, so if the printer clips, stretches or centres the image
 * the defect is unmistakable on paper instead of being hidden by anti-aliasing.
 *
 * Layout, top to bottom:
 *   • a solid bar spanning every column (full-width proof)
 *   • an outlined frame touching all four edges
 *   • a checkerboard of 8-dot squares (dot-alignment / density)
 *   • ruler ticks every 64 dots, taller every 128
 *   • alternating 1-dot horizontal hairlines (vertical resolution)
 */
export function rasterTestPattern(widthDots: number): Bitmap1bpp {
  const height = 260
  const bytesPerRow = Math.ceil(widthDots / 8)
  const data = new Uint8Array(bytesPerRow * height)
  const set = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= widthDots || y >= height) return
    data[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7)
  }
  const hLine = (y: number, from = 0, to = widthDots - 1): void => {
    for (let x = from; x <= to; x++) set(x, y)
  }
  const vLine = (x: number, from: number, to: number): void => {
    for (let y = from; y <= to; y++) set(x, y)
  }

  // 1. Solid full-width bar — any clipping shows immediately as a short bar.
  for (let y = 0; y < 12; y++) hLine(y)

  // 2. Frame touching all four edges of the printable area.
  const top = 20
  const bottom = height - 1
  hLine(top)
  hLine(top + 1)
  hLine(bottom)
  hLine(bottom - 1)
  vLine(0, top, bottom)
  vLine(1, top, bottom)
  vLine(widthDots - 1, top, bottom)
  vLine(widthDots - 2, top, bottom)

  // 3. Checkerboard of 8-dot squares.
  const checkTop = top + 12
  const checkBottom = checkTop + 96
  for (let y = checkTop; y < checkBottom; y++) {
    for (let x = 8; x < widthDots - 8; x++) {
      if ((((x >> 3) + (y >> 3)) & 1) === 0) set(x, y)
    }
  }

  // 4. Ruler ticks every 64 dots (taller every 128) — read the width straight off paper.
  const rulerTop = checkBottom + 14
  for (let x = 0; x < widthDots; x += 64) {
    const tall = x % 128 === 0
    vLine(x, rulerTop, rulerTop + (tall ? 28 : 16))
  }
  // Always mark the true last column, even when width is not a multiple of 64.
  vLine(widthDots - 1, rulerTop, rulerTop + 28)

  // 5. 1-dot horizontal hairlines: alternating on/off rows test vertical resolution.
  const hairTop = rulerTop + 36
  for (let y = hairTop; y < hairTop + 24; y += 2) hLine(y, 8, widthDots - 9)

  return { width: widthDots, height, data }
}
