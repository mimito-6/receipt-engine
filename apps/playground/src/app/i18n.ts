// Lightweight i18n: a baked dictionary (zh-Hant / ja / en), a t() lookup, and
// applyI18n() that translates [data-i18n] text, [data-i18n-ph] placeholders and
// [data-i18n-title] titles, plus the language switcher state. Language persists
// to localStorage and falls back to the browser language, then zh-Hant.
import { DICT, type Lang } from './i18n-dict'

export type { Lang }

// Strings not extracted from the old UI (new brand tagline etc.).
const EXTRA: Record<string, { zh: string; ja: string; en: string }> = {
  'brand.tagline': {
    zh: '生成你的收據模板 · 純瀏覽器、免上傳',
    ja: 'ブラウザだけでレシートのテンプレートを作成',
    en: 'Generate your receipt template — all in your browser',
  },
  'look.edges': {
    zh: '收據機邊框(鋸齒撕邊)',
    ja: 'レシート風のフチ(ギザギザ切り取り)',
    en: 'Receipt-machine edges (torn / perforated)',
  },
  'look.edgesHint': {
    zh: '鋸齒撕邊版型,乾淨匯出也保留',
    ja: 'ギザギザのレシート型。背景なしの書き出しでも残ります',
    en: 'Torn-edge layout — kept even in a clean/transparent export',
  },
  // ── print-feed ceremony (Phase B) ──
  'print.warming': { zh: '預熱印表機…', ja: 'プリンター予熱中…', en: 'Warming up the press…' },
  'print.printing': { zh: '列印中…', ja: '印刷中…', en: 'Printing…' },
  'print.done': { zh: '列印完成', ja: '印刷完了', en: 'Printed' },
  'print.skip': { zh: '點一下跳過', ja: 'タップでスキップ', en: 'Tap to skip' },
  'export.fastPrint': {
    zh: '快速匯出(略過列印動畫)',
    ja: '高速書き出し(印刷アニメをスキップ)',
    en: 'Fast export (skip the print animation)',
  },
  // ── blank start + autosave/restore (Phase C) ──
  'example.blank': { zh: '從空白開始', ja: '空白から作る', en: 'Start blank' },
  'restore.prompt': { zh: '還原上次的設計?', ja: '前回のデザインを復元しますか?', en: 'Restore your last design?' },
  'restore.yes': { zh: '還原', ja: '復元', en: 'Restore' },
  'restore.no': { zh: '不用', ja: 'いいえ', en: 'No thanks' },
  'sound.toggle': { zh: '音效開關', ja: '効果音 オン/オフ', en: 'Sound on / off' },
}
const TABLE: Record<string, { zh: string; ja: string; en: string }> = { ...DICT, ...EXTRA }

const LS_KEY = 'receipt-engine-lang'
const SUPPORTED: Lang[] = ['zh', 'ja', 'en']

function detect(): Lang {
  try {
    const s = localStorage.getItem(LS_KEY) as Lang | null
    if (s && SUPPORTED.includes(s)) return s
  } catch {
    /* ignore */
  }
  const n = (navigator.language || '').toLowerCase()
  if (n.startsWith('ja')) return 'ja'
  if (n.startsWith('en')) return 'en'
  return 'zh'
}

let lang: Lang = detect()
export function getLang(): Lang {
  return lang
}

/** Translate a key for the current language; {n}-style vars are substituted. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const e = TABLE[key]
  let s = e ? e[lang] : key
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]))
  return s
}

/** Apply translations to the whole document + sync the switcher. */
export function applyI18n(): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n')
    if (k) el.textContent = t(k)
  })
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-ph]').forEach((el) => {
    const k = el.getAttribute('data-i18n-ph')
    if (k) el.placeholder = t(k)
  })
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const k = el.getAttribute('data-i18n-title')
    if (k) el.title = t(k)
  })
  document.querySelectorAll<HTMLElement>('.lang button[data-lang]').forEach((b) => {
    const on = b.getAttribute('data-lang') === lang
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', on ? 'true' : 'false')
  })
  document.title = `${t('brand.title')} · ${t('brand.tagline')}`
}

export function setLang(l: Lang): void {
  lang = l
  try {
    localStorage.setItem(LS_KEY, l)
  } catch {
    /* ignore */
  }
  applyI18n()
}
