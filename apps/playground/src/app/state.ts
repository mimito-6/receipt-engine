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
  /** Torn "receipt-machine" edges, per theme (thermal defaults on). */
  edges: { custom: boolean; thermal: boolean }
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
  edges: { custom: false, thermal: true },
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

// Crisp VECTOR stickers (no emoji): each is an SVG data-URI, rendered as an image sticker
// on screen and embedded in the export. On-brand zine marks in ink / ultramarine / lime.
const _ink = '#14140F'
const _blue = '#1B4DE4'
const _lime = '#C8F230'
const vsticker = (inner: string): string =>
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`)

// All marks are SOLID FILLS — no outline strokes ("無邊框") — for a clean, designed sticker set.
export const STICKERS: string[] = [
  // 4-point sparkle (blue)
  vsticker(`<path d="M50 5C54 35 65 46 95 50C65 54 54 65 50 95C46 65 35 54 5 50C35 46 46 35 50 5Z" fill="${_blue}"/>`),
  // double sparkle (ink)
  vsticker(
    `<path d="M38 8C41 27 49 35 68 38C49 41 41 49 38 68C35 49 27 41 8 38C27 35 35 27 38 8Z" fill="${_ink}"/>` +
      `<path d="M76 54C78 65 84 71 95 73C84 75 78 81 76 92C74 81 68 75 57 73C68 71 74 65 76 54Z" fill="${_ink}"/>`,
  ),
  // solid 5-point star (lime)
  vsticker(`<path d="M50 6 61 38 95 39 68 60 78 93 50 73 22 93 32 60 5 39 39 38Z" fill="${_lime}"/>`),
  // solid heart (blue)
  vsticker(`<path d="M50 84C18 62 12 41 26 30 38 21 50 31 50 38 50 31 62 21 74 30 88 41 82 62 50 84Z" fill="${_blue}"/>`),
  // solid lightning (lime)
  vsticker(`<path d="M58 6 26 56H46L40 94 76 40H54Z" fill="${_lime}"/>`),
  // flower — blue petals + lime core (two-tone fill)
  vsticker(
    `<g fill="${_blue}"><circle cx="50" cy="24" r="17"/><circle cx="75" cy="42" r="17"/><circle cx="66" cy="73" r="17"/><circle cx="34" cy="73" r="17"/><circle cx="25" cy="42" r="17"/></g>` +
      `<circle cx="50" cy="50" r="15" fill="${_lime}"/>`,
  ),
  // organic blob (lime)
  vsticker(
    `<path d="M54 8C72 7 86 19 91 37 96 55 85 65 78 77 70 89 53 96 37 90 21 84 7 71 8 53 9 36 19 23 31 17 41 12 46 9 54 8Z" fill="${_lime}"/>`,
  ),
  // teardrop / dot (blue)
  vsticker(`<path d="M50 8C50 8 80 46 80 64A30 30 0 0 1 20 64C20 46 50 8 50 8Z" fill="${_blue}"/>`),
  // sun — solid disc + rays (lime)
  vsticker(
    `<circle cx="50" cy="50" r="20" fill="${_lime}"/>` +
      `<g fill="${_lime}"><path d="M50 3 56 18 44 18Z"/><path d="M50 97 56 82 44 82Z"/><path d="M3 50 18 44 18 56Z"/><path d="M97 50 82 44 82 56Z"/><path d="M16 16 30 23 23 30Z"/><path d="M84 84 70 77 77 70Z"/><path d="M84 16 77 30 70 23Z"/><path d="M16 84 23 70 30 77Z"/></g>`,
  ),
  // cloud (blue)
  vsticker(`<path d="M30 72A19 19 0 0 1 31 35 25 25 0 0 1 76 40 17 17 0 0 1 75 72Z" fill="${_blue}"/>`),
  // speech bubble (lime)
  vsticker(
    `<path d="M18 18H82A9 9 0 0 1 91 27V59A9 9 0 0 1 82 68H46L27 88 30 68H18A9 9 0 0 1 9 59V27A9 9 0 0 1 18 18Z" fill="${_lime}"/>`,
  ),
  // rounded cross / plus (blue)
  vsticker(
    `<path d="M42 12H58A4 4 0 0 1 62 16V38H84A4 4 0 0 1 88 42V58A4 4 0 0 1 84 62H62V84A4 4 0 0 1 58 88H42A4 4 0 0 1 38 84V62H16A4 4 0 0 1 12 58V42A4 4 0 0 1 16 38H38V16A4 4 0 0 1 42 12Z" fill="${_blue}"/>`,
  ),
  // confetti dots (blue / lime / ink)
  vsticker(
    `<circle cx="28" cy="32" r="13" fill="${_blue}"/><circle cx="70" cy="28" r="11" fill="${_lime}"/><circle cx="52" cy="70" r="15" fill="${_ink}"/>`,
  ),
  // crescent moon (ink)
  vsticker(`<path d="M64 10A41 41 0 1 0 64 90 33 33 0 1 1 64 10Z" fill="${_ink}"/>`),
  // pennant / flag (blue)
  vsticker(`<path d="M14 28H86V60L74 51 62 60 50 51 38 60 26 51 14 60Z" fill="${_blue}"/>`),
  // solid diamond (lime)
  vsticker(`<path d="M50 8 84 50 50 92 16 50Z" fill="${_lime}"/>`),
]
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
  // ── minimal clean starter (no background frame: bg == surface) ──
  blank: {
    receipt: {
      schemaVersion: '0.1',
      currency: 'TWD',
      merchant: { name: '我的小店' },
      transaction: { receiptNo: '0001', issuedAt: '2026-06-01T12:00' },
      items: [{ name: '商品 1', quantity: 1, unitPrice: 100 }],
      message: { title: 'Thank you!' },
    } as Draft,
    custom: { primary: '#2b2b33', bg: '#eef0f3', surface: '#ffffff', text: '#2b2b33', latinFont: 'poppins', cjkFont: 'noto' },
  },
  // ── 同人攤位: cheerful pink, rounded playful font, corner stars ──
  cute: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'Mimito Booth', subtitle: '手作 × 插畫 × 小誌' },
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
      message: { title: 'Thank you!', body: '感謝支持我們的攤位,希望你喜歡這次的作品。', footer: 'See you next event!' },
      stickers: [
        { content: STICKERS[2], anchor: 'free', x: 118, y: 120, size: 52 },
        { content: STICKERS[3], anchor: 'free', x: 612, y: 92, size: 50 },
      ],
    } as Draft,
    custom: { primary: '#ef5b9c', bg: '#fbe9f1', surface: '#ffffff', text: '#3a2733', latinFont: 'fredoka', cjkFont: 'noto', stars: true },
  },
  // ── 印刷所: the BLUE STORE PRESS zine look — blue + warm cream paper, mono ──
  zine: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'BLUE STORE PRESS', subtitle: 'RISO ZINE · PRINT · GOODS' },
      transaction: { receiptNo: 'BSP-0042', issuedAt: '2026-06-01T13:20', cashier: 'Press' },
      items: [
        { name: 'Riso Zine', variant: 'A5 / 24p', quantity: 1, unitPrice: 220 },
        { name: 'Print Set', variant: '3 sheets', quantity: 1, unitPrice: 180 },
        { name: 'Sticker Sheet', quantity: 2, unitPrice: 60 },
      ],
      payments: [{ method: 'Cash', amount: 600 }],
      qr: { value: 'https://bluestore.press', label: 'SHOP ONLINE' },
      message: { title: 'PRINTED FOR YOU', footer: 'KEEP THE RECEIPT' },
      stickers: [{ content: STICKERS[0], anchor: 'free', x: 612, y: 96, size: 52 }],
    } as Draft,
    custom: { primary: '#1B4DE4', bg: '#EFE9D6', surface: '#FBF8EF', text: '#14140F', latinFont: 'spacemono', cjkFont: 'sarasa' },
  },
  // ── 咖啡店: warm espresso on cream ──
  coffee: {
    receipt: {
      schemaVersion: '0.1',
      currency: 'USD',
      merchant: { name: 'Corner Coffee', subtitle: 'Daily roast & fresh bakes' },
      transaction: { receiptNo: '0042', issuedAt: '2026-06-01T08:15', cashier: 'Sam' },
      items: [
        { name: 'Flat White', quantity: 1, unitPrice: 4.5, tags: ['Signature'] },
        { name: 'Butter Croissant', quantity: 2, unitPrice: 3.25 },
        { name: 'Banana Bread', variant: 'Warm', quantity: 1, unitPrice: 3.75 },
      ],
      payments: [{ method: 'Card', amount: 14.75 }],
      qr: { value: 'https://corner.coffee/r/0042', label: 'View online' },
      message: { title: 'Thank you!', body: 'Have a lovely day.' },
    } as Draft,
    custom: { primary: '#7a4a24', bg: '#f3e9da', surface: '#fffaf3', text: '#4a3526', latinFont: 'poppins', cjkFont: 'noto' },
  },
  // ── 手作市集: botanical green ──
  market: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: '微光手作 Glow', subtitle: '蠟燭・乾燥花・香氛' },
      event: { name: '週末手作市集', boothName: 'Row B · Stall 7', location: '華山 1914', date: '2026-06-01' },
      transaction: { receiptNo: 'MKT-20260601-031', issuedAt: '2026-06-01T16:05', cashier: '阿光' },
      items: [
        { name: '大豆蠟燭 Soy Candle', variant: '海鹽鼠尾草', quantity: 1, unitPrice: 480, tags: ['手作'] },
        { name: '乾燥花束 Dried Bouquet', quantity: 1, unitPrice: 360, tags: ['期間限定'] },
        { name: '香氛蠟磚 Wax Tablet', quantity: 3, unitPrice: 150 },
      ],
      discounts: [{ label: '市集首日優惠', amount: 129 }],
      payments: [{ method: 'Cash', amount: 1500 }],
      qr: { value: 'https://glow.example/feedback', label: '填回饋拿小禮' },
      message: { body: '手工製作,每件都獨一無二。', footer: '下次市集見' },
    } as Draft,
    custom: { primary: '#2f7a55', bg: '#e8f0ea', surface: '#ffffff', text: '#2c3a32', latinFont: 'nunito', cjkFont: 'noto' },
  },
  // ── 像素遊戲: pixel font + retro teal on cream ──
  pixel: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'PIXEL ARCADE', subtitle: '8-BIT GOODS & TOKENS' },
      transaction: { receiptNo: 'PX-1985', issuedAt: '2026-06-01T20:10', cashier: 'P1' },
      items: [
        { name: 'Arcade Tokens', variant: 'x20', quantity: 1, unitPrice: 200 },
        { name: 'Enamel Pin', variant: '1UP', quantity: 1, unitPrice: 150, tags: ['LIMITED'] },
        { name: 'Game Sticker', quantity: 3, unitPrice: 40 },
      ],
      payments: [{ method: 'Cash', amount: 500 }],
      qr: { value: 'https://pixel.arcade/hi', label: 'HI-SCORE' },
      message: { title: 'PLAYER 1 · THANKS', footer: 'INSERT COIN TO CONTINUE' },
      stickers: [{ content: STICKERS[12], anchor: 'free', x: 120, y: 118, size: 50 }],
    } as Draft,
    custom: { primary: '#17a398', bg: '#f0e6cb', surface: '#fff8e8', text: '#222222', latinFont: 'cubic', cjkFont: 'cubic', stars: true },
  },
  // ── 精品手帳: elegant muted gold on ivory ──
  boutique: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'ATELIER NOIR', subtitle: '手帳・文具・選物' },
      transaction: { receiptNo: 'AN-2026-0601', issuedAt: '2026-06-01T15:40', cashier: 'Lin' },
      items: [
        { name: '皮革手帳 Leather Journal', variant: 'A5 / Tan', quantity: 1, unitPrice: 1280, tags: ['限定'] },
        { name: '黃銅筆 Brass Pen', quantity: 1, unitPrice: 680 },
        { name: '封蠟印章 Wax Seal', quantity: 1, unitPrice: 420 },
      ],
      payments: [{ method: 'Card', amount: 2380 }],
      qr: { value: 'https://ateliernoir.example', label: '會員專屬' },
      message: { title: 'Merci', body: '謝謝您的選購,願文字陪伴您每一天。' },
    } as Draft,
    custom: { primary: '#b08948', bg: '#ece6da', surface: '#faf8f4', text: '#3a3631', latinFont: 'poppins', cjkFont: 'noto' },
  },
  // ── 夜間霓虹: full dark receipt, neon-lime accent ──
  night: {
    receipt: {
      schemaVersion: '0.1',
      locale: 'zh-TW',
      currency: 'TWD',
      merchant: { name: 'MIDNIGHT MART', subtitle: '深夜販賣部 · 24H' },
      transaction: { receiptNo: 'MM-2350', issuedAt: '2026-06-01T23:50', cashier: 'Owl' },
      items: [
        { name: 'Energy Drink', quantity: 2, unitPrice: 45 },
        { name: 'Instant Noodles', variant: '辣味', quantity: 1, unitPrice: 38 },
        { name: 'Mochi Ice', quantity: 3, unitPrice: 30 },
      ],
      payments: [{ method: 'Cash', amount: 200 }],
      qr: { value: 'https://midnight.mart', label: 'NIGHT OWL CLUB' },
      message: { title: 'STAY UP, STAY FED', footer: 'SEE YOU AFTER DARK' },
      stickers: [{ content: STICKERS[4], anchor: 'free', x: 612, y: 96, size: 52 }],
    } as Draft,
    custom: { primary: '#C8F230', bg: '#0d0d13', surface: '#1b1b24', text: '#e8e8ee', latinFont: 'spacemono', cjkFont: 'sarasa', stars: true },
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
export function curEdges(): boolean {
  return state.edges[state.theme]
}
