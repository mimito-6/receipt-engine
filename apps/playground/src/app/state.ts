// Editor state model + constants + pure helpers (no DOM, no engine).
// The single mutable `state` is the source of truth; the canvas only mirrors it.
import type { ReceiptDocument } from '@receipt-engine/core'

export type ThemeName = 'custom' | 'thermal'

/** Per-theme look: colors + independent Latin/CJK fonts + corner stars. */
export interface Look {
  primary: string
  bg: string
  surface: string
  text: string
  latinFont: string
  cjkFont: string
  stars?: boolean
}

export interface Pad {
  top: number
  bottom: number
  x: number
}

/** What the editor currently has selected (for the contextual inspector). */
export type Selection =
  | { kind: 'text'; id: string }
  | { kind: 'block'; key: string }
  | { kind: 'sticker'; index: number }
  | null

/** A loose editing draft — always passes safeValidateReceipt before it renders. */
export type Draft = ReceiptDocument & Record<string, any>

export interface State {
  theme: ThemeName
  receipt: Draft
  look: { custom: Look | null; thermal: Look | null }
  width: { custom: number; thermal: number }
  pad: { custom: Pad | null; thermal: Pad | null }
  /** Force all images B&W, per theme (thermal defaults on). */
  mono: { custom: boolean; thermal: boolean }
  scale: number
  /** Export with a transparent background (clean PNG for printing). */
  cleanExport: boolean
  /** Legacy selected-sticker index (kept for the sticker list panel). */
  sel: number
  /** Unified editor selection (Phase 1+). */
  selection: Selection
}

export const state: State = {
  theme: 'custom',
  receipt: null as unknown as Draft,
  look: { custom: null, thermal: null },
  width: { custom: 720, thermal: 384 },
  pad: { custom: null, thermal: null },
  mono: { custom: false, thermal: true },
  scale: 340,
  cleanExport: false,
  sel: -1,
  selection: null,
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const deepClone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T

export function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export function isImg(s: unknown): boolean {
  return /^data:|^https?:|\.(png|jpe?g|gif|svg|webp)$/i.test(String(s || ''))
}

// Latin & CJK fonts are picked independently; per-character fallback means Latin
// glyphs use the Latin font and Chinese glyphs use the CJK font.
export const LATIN: Record<string, string> = {
  quicksand: "'Quicksand'",
  nunito: "'Nunito'",
  baloo: "'Baloo 2'",
  poppins: "'Poppins'",
  fredoka: "'Fredoka'",
  spacemono: "'Space Mono'",
  cubic: "'Cubic 11'",
  boutique: "'Boutique Bitmap 9x9'",
  boutiqueBold: "'Boutique Bitmap 9x9 Bold'",
}
export const CJK: Record<string, string> = {
  noto: "'Noto Sans TC'",
  cubic: "'Cubic 11'",
  boutique: "'Boutique Bitmap 9x9'",
  boutiqueBold: "'Boutique Bitmap 9x9 Bold'",
  sarasa: "'Sarasa Mono TC'",
  system: "'PingFang TC','Microsoft JhengHei'",
}

export function fontStack(latin: string, cjk: string): string {
  return (
    (LATIN[latin] || LATIN.quicksand) +
    ',' +
    (CJK[cjk] || CJK.noto) +
    ",'PingFang TC','Microsoft JhengHei',sans-serif"
  )
}

export const EMOJIS = ['🎀', '🌸', '✨', '💖', '🐱', '⭐', '🍰', '🎁', '🧁', '☕', '🌟', '💐', '🐰', '🍓']
export const DEFAULT_W: Record<ThemeName, number> = { custom: 720, thermal: 384 }

// Each theme remembers its OWN look (colors / font / corner stars).
export const THERMAL_LOOK: Look = {
  primary: '#111111',
  bg: '#e7e7e7',
  surface: '#fbfbfb',
  text: '#1a1a1a',
  latinFont: 'spacemono',
  cjkFont: 'sarasa',
  stars: false,
}

export const examples: Record<string, { receipt: Draft; custom: Look }> = {
  coffee: {
    receipt: {
      schemaVersion: '0.1',
      currency: 'USD',
      merchant: { name: 'Corner Coffee', subtitle: 'Daily roast & fresh bakes', icon: '☕' },
      transaction: { receiptNo: '0042', issuedAt: '2026-06-01T08:15', cashier: 'Sam' },
      items: [
        { name: 'Flat White', quantity: 1, unitPrice: 4.5 },
        { name: 'Butter Croissant', quantity: 2, unitPrice: 3.25 },
      ],
      payments: [{ method: 'Cash', amount: 15 }],
      qr: { value: 'https://corner.coffee/r/0042', label: 'View online' },
      message: { title: 'Thank you!', body: 'Have a lovely day.' },
    } as Draft,
    custom: {
      primary: '#8a5a2b',
      bg: '#f6efe6',
      surface: '#fffdf8',
      text: '#4a3b2a',
      latinFont: 'poppins',
      cjkFont: 'noto',
    },
  },
  cute: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'Mimito Booth', subtitle: '手作 × 插畫 × 小誌', icon: '🎀' },
      event: { name: 'Artist Alley', boothNumber: 'A12', location: 'Taipei', date: '2026-06-01' },
      transaction: { receiptNo: 'AA-A12-018', issuedAt: '2026-06-01T14:30', cashier: 'Mimi' },
      items: [
        { name: 'Sticker Set', variant: 'Pastel', quantity: 2, unitPrice: 120, tags: ['新刊'] },
        { name: 'Mini Zine', variant: '32p / A6', quantity: 1, unitPrice: 180, tags: ['新刊', '特典'] },
        { name: 'Acrylic Charm', quantity: 1, unitPrice: 250 },
      ],
      discounts: [{ label: '套組優惠', amount: 50 }],
      payments: [{ method: 'Cash', amount: 700 }],
      qr: { value: 'https://instagram.com/mimito.art', label: '追蹤我們', caption: '新作 & 下次擺攤資訊' },
      message: {
        title: 'Thank you! ♡',
        body: '感謝支持我們的攤位,希望你喜歡這次的作品。',
        footer: 'See you next event!',
      },
      stickers: [
        { content: '✨', anchor: 'free', x: 610, y: 90, size: 46 },
        { content: '🎀', anchor: 'free', x: 120, y: 120, size: 46 },
      ],
    } as Draft,
    custom: {
      primary: '#d6336c',
      bg: '#fff0f6',
      surface: '#fffdfb',
      text: '#5b3256',
      latinFont: 'quicksand',
      cjkFont: 'noto',
    },
  },
  market: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: '微光手作 Glow', subtitle: '蠟燭・乾燥花・香氛', icon: '🕯️' },
      event: { name: '週末手作市集', boothName: 'Row B · Stall 7', location: '華山 1914', date: '2026-06-01' },
      transaction: { receiptNo: 'MKT-20260601-031', issuedAt: '2026-06-01T16:05', cashier: '阿光' },
      items: [
        { name: '大豆蠟燭 Soy Candle', variant: '海鹽鼠尾草', quantity: 1, unitPrice: 480 },
        { name: '乾燥花束 Dried Bouquet', quantity: 1, unitPrice: 360 },
        { name: '香氛蠟磚 Wax Tablet', quantity: 3, unitPrice: 150 },
      ],
      discounts: [{ label: '市集首日優惠', amount: 129 }],
      payments: [{ method: 'Cash', amount: 1500 }],
      qr: { value: 'https://glow.example/feedback', label: '填回饋拿小禮' },
      message: { body: '手工製作,每件都獨一無二。', footer: '下次市集見 ☀' },
    } as Draft,
    custom: {
      primary: '#2f6f4f',
      bg: '#eef4ef',
      surface: '#ffffff',
      text: '#2c3a32',
      latinFont: 'nunito',
      cjkFont: 'noto',
    },
  },
}

/** One-click font choices for the per-element inspector (each = a full stack). */
export interface FontPreset {
  id: string
  label: string
  stack: string
}
export const FONT_PRESETS: FontPreset[] = [
  { id: 'quicksand', label: '圓潤 Quicksand', stack: fontStack('quicksand', 'noto') },
  { id: 'nunito', label: '柔和 Nunito', stack: fontStack('nunito', 'noto') },
  { id: 'baloo', label: '粗胖 Baloo 2', stack: fontStack('baloo', 'noto') },
  { id: 'poppins', label: '簡約 Poppins', stack: fontStack('poppins', 'noto') },
  { id: 'fredoka', label: '俏皮 Fredoka', stack: fontStack('fredoka', 'noto') },
  { id: 'spacemono', label: '等寬 Space Mono', stack: fontStack('spacemono', 'sarasa') },
  { id: 'cubic', label: '像素 Cubic 11', stack: fontStack('cubic', 'cubic') },
  { id: 'boutique', label: '像素 Boutique 9x9', stack: fontStack('boutique', 'boutique') },
  { id: 'boutiqueBold', label: '像素 Boutique 粗', stack: fontStack('boutiqueBold', 'boutiqueBold') },
]

export function curLook(): Look {
  return state.look[state.theme] as Look
}
export function curPad(): Pad {
  return state.pad[state.theme] as Pad
}
export function curWidth(): number {
  return state.width[state.theme]
}
export function curMono(): boolean {
  return state.mono[state.theme]
}
