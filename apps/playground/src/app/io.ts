// Import boundary (POS/order -> receipt), normalize, file downloads, and the
// save/restore config file. The import seam here is what the OpenBooth POS
// integration will eventually call (promoted to @receipt-engine/import later).
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { getTheme } from '@receipt-engine/themes'
import { dl } from './dom'
import { currentTheme, renderOpts } from './render'
import { type Draft, type Look, type Pad, type ThemeName, deepClone, isImg, state } from './state'

export function defaultPad(theme: ThemeName): Pad {
  const p = getTheme(theme).spacing.page || 30
  return { top: p * 4, bottom: p * 4, x: p }
}

// ---------- import boundary (future POS/order connector plugs in here) ----------
export function mapLineItem(li: any): any {
  return {
    name: li.name || li.title || '',
    variant: li.variant || (li.options && li.options.join(' / ')) || undefined,
    quantity: Number(li.quantity != null ? li.quantity : li.qty != null ? li.qty : 1),
    unitPrice: Number(
      li.unitPrice != null ? li.unitPrice : li.price != null ? li.price : li.total / (li.quantity || 1) || 0,
    ),
    note: li.note || undefined,
    tags: li.tags || undefined,
  }
}

export function importOrder(ext: any): Draft {
  ext = ext || {}
  return {
    schemaVersion: '0.1',
    locale: ext.locale,
    currency: ext.currency || 'TWD',
    merchant: {
      name: (ext.store && ext.store.name) || ext.merchant || 'Shop',
      subtitle: ext.store && ext.store.tagline,
      icon: ext.store && ext.store.icon,
      logo: ext.store && ext.store.logoUrl,
    },
    transaction: {
      receiptNo: String(ext.orderId || ext.number || ext.receiptNo || ''),
      issuedAt: ext.createdAt || ext.issuedAt || '',
      cashier: ext.cashier,
    },
    items: (ext.lineItems || ext.items || []).map(mapLineItem),
    discounts: (ext.discounts || []).map((d: any) => ({
      label: d.title || d.label || 'Discount',
      amount: Math.abs(Number(d.amount || 0)),
    })),
    payments: (ext.payments || ext.tenders || []).map((p: any) => ({
      method: p.method || p.type || 'Cash',
      amount: Number(p.amount || 0),
      reference: p.reference,
    })),
    message: ext.note ? { body: ext.note } : undefined,
  } as Draft
}

/** Fill in editor-required fields so a freshly loaded receipt is editable. */
export function normalize(r: Draft): Draft {
  if (!r.transaction) r.transaction = { receiptNo: 'R-001', issuedAt: '2026-06-01T12:00' }
  if (!r.items || !r.items.length) r.items = [{ name: '品項', quantity: 1, unitPrice: 100 }]
  ;(r.stickers || []).forEach((s: any) => {
    s.anchor = 'free'
    if (s.x == null) s.x = Math.round(720 * 0.5)
    if (s.y == null) s.y = 80
    if (s.size == null) s.size = isImg(s.content) ? 64 : 46
    if (s.rotation == null) s.rotation = 0
  })
  return r
}

// ---------- downloads ----------
export function currentSvg(): string {
  return renderReceiptToSvg(state.receipt as never, renderOpts({ includeXmlDeclaration: true }) as never)
}

// PNG export (with font embedding) lives in ./pngExport.ts.

export function downloadSvg(): void {
  dl('receipt.svg', new Blob([currentSvg()], { type: 'image/svg+xml' }))
}
export function downloadHtml(): void {
  dl(
    'receipt.html',
    new Blob([renderReceiptToHtml(state.receipt as never, renderOpts() as never)], { type: 'text/html' }),
  )
}

// ---------- config file (save / restore the whole design) ----------
export function buildConfig(): Record<string, unknown> {
  return {
    _type: 'receipt-engine-config',
    version: 1,
    theme: state.theme,
    width: state.width,
    pad: state.pad,
    scale: state.scale,
    look: state.look,
    receipt: state.receipt,
  }
}
export function normPad(pd: Partial<Pad> | undefined, theme: ThemeName): Pad {
  const d = defaultPad(theme)
  pd = pd || {}
  return {
    top: pd.top != null ? pd.top : d.top,
    bottom: pd.bottom != null ? pd.bottom : d.bottom,
    x: pd.x != null ? pd.x : d.x,
  }
}
export function fixLook(l: Look | null | undefined, fb: Look): Look {
  l = l || deepClone(fb)
  if (!l.latinFont) l.latinFont = 'quicksand'
  if (!l.cjkFont) l.cjkFont = 'noto'
  return l
}
