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
    ja: 'ブラウザだけでレシートのテンプレートを作成 · アップロード不要',
    en: 'Generate your receipt template — all in your browser, nothing uploaded',
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
  'print.warming': { zh: '印刷機預熱中…', ja: '印刷機を予熱中…', en: 'Warming up the press…' },
  'print.printing': { zh: '印刷中…', ja: '印刷中…', en: 'Printing…' },
  'print.done': { zh: '印好了', ja: '刷り上がり', en: 'Printed' },
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
  // ── customer handoff present-mode (Phase C) ──
  'handoff.enter': { zh: '交給客人', ja: 'お客さまへ渡す', en: 'Hand to customer' },
  'handoff.title': { zh: '交給客人', ja: 'お客さまへ', en: 'Hand to customer' },
  'handoff.close': { zh: '關閉', ja: '閉じる', en: 'Close' },
  'handoff.share': { zh: '分享', ja: '共有', en: 'Share' },
  'handoff.save': { zh: '儲存圖片', ja: '画像を保存', en: 'Save image' },
  'handoff.shareTitle': { zh: '我的收據', ja: 'レシート', en: 'My receipt' },
  'handoff.shared': { zh: '已分享', ja: '共有しました', en: 'Shared' },
  'handoff.savedHint': {
    zh: '已儲存圖片',
    ja: '画像を保存しました',
    en: 'Image saved',
  },
  // ── export result toasts (Phase C) ──
  'autosave.quota': {
    zh: '圖片太大,自動備份已停止——記得手動「下載設定檔」保存。',
    ja: '画像が大きく自動バックアップを停止しました——「設定を保存」で手動保存してください。',
    en: 'Image too large — autosave stopped. Use “Save config” to save manually.',
  },
  'toast.png': { zh: '已下載 PNG', ja: 'PNG を保存しました', en: 'PNG saved' },
  'toast.svg': { zh: '已下載 SVG', ja: 'SVG を保存しました', en: 'SVG saved' },
  'toast.html': { zh: '已下載 HTML', ja: 'HTML を保存しました', en: 'HTML saved' },
  // ── de-emoji overrides ──
  'placeholder.icon': { zh: '或一個字當圖示', ja: '1文字をアイコンに', en: 'A letter as icon' },
  'theme.group.label': { zh: '收據風格', ja: 'レシートのスタイル', en: 'Receipt style' },
  'spec.size': { zh: '尺寸', ja: 'サイズ', en: 'Size' },
  'canvas.hint.touch': {
    zh: '點文字改樣式 · 拖貼紙縮放旋轉 · 用「尺寸」卡改大小 · 用「版面順序」↑↓ 排序',
    ja: 'テキストをタップして編集 · ステッカーをドラッグで拡縮/回転 · 「サイズ」カードで大きさ · 「レイアウト順序」↑↓ で並べ替え',
    en: 'Tap text to style · drag stickers to scale/rotate · resize via the Size card · reorder via the Layout order panel',
  },
  'sticker.limit': { zh: '貼紙數量已達上限', ja: 'ステッカーの上限に達しました', en: 'Sticker limit reached' },
  'sticker.deleted': { zh: '已刪除貼紙', ja: 'ステッカーを削除しました', en: 'Sticker deleted' },
  'sound.on': { zh: '音效:開', ja: '効果音:オン', en: 'Sound: on' },
  'sound.muted': { zh: '音效:關', ja: '効果音:オフ', en: 'Sound: off' },
  'order.moveUp': { zh: '{name} 上移', ja: '{name} を上へ', en: 'Move {name} up' },
  'order.moveDown': { zh: '{name} 下移', ja: '{name} を下へ', en: 'Move {name} down' },
  'order.moved': { zh: '{name} 已移動', ja: '{name} を移動しました', en: '{name} moved' },
  'btn.saveConfig': { zh: '下載設定檔', ja: '設定を保存', en: 'Save config' },
  'btn.loadConfig': { zh: '載入設定檔', ja: '設定を読込', en: 'Load config' },
  // ── first-run studio intro (Phase C) ──
  'intro.kicker': { zh: '[ 收據工作室 ]', ja: '[ レシート工房 ]', en: '[ RECEIPT STUDIO ]' },
  'intro.title': { zh: '做一張你的收據', ja: 'レシートを作ろう', en: 'Make your receipt' },
  'intro.tagline': {
    zh: '點文字改字、拖貼紙、選版型 —— 做完一鍵交給客人。',
    ja: '文字をタップ、ステッカーをドラッグ、テーマを選ぶ —— 完成したらお客さまへ。',
    en: 'Tap to edit, drag stickers, pick a theme — then hand it to your customer.',
  },
  'intro.chip1': { zh: '點文字改字', ja: '文字をタップ', en: 'Tap text' },
  'intro.chip2': { zh: '拖貼紙', ja: 'ステッカーをドラッグ', en: 'Drag stickers' },
  'intro.chip3': { zh: '切版型', ja: 'テーマ切替', en: 'Switch theme' },
  'intro.start': { zh: '開始設計', ja: 'はじめる', en: 'Start designing' },
  'row.remove': { zh: '移除', ja: '削除', en: 'Remove' },
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
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    const k = el.getAttribute('data-i18n-aria-label')
    if (k) el.setAttribute('aria-label', t(k))
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
