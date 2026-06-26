// Phase 3 — block reordering. Two ways, both writing state.receipt.blockOrder:
//   1) Canvas: press a section and drag it up/down (insertion line shows where it
//      lands). A press without movement falls through to text selection.
//   2) A "版面順序" panel with up/down arrows — reliable on every device (esp. touch,
//      where a drag would fight page scroll).
import { $, rectOf } from './dom'
import { state } from './state'
import { render } from './render'
import { clearSelection, selectText } from './inspector'
import { announce } from './feel'
import { t } from './i18n'

const THRESHOLD = 7 // px of movement before a press becomes a block drag

// element key → i18n key (translated at render time so language switches refresh the panel)
const LABELS: Record<string, string> = {
  logo: 'order.logo',
  name: 'order.name',
  subtitle: 'order.subtitle',
  event: 'order.event',
  body: 'order.body',
  customBlocks: 'order.customBlocks',
  qrImage: 'order.qrImage',
  qrLabel: 'order.qrLabel',
  qrCaption: 'order.qrCaption',
  messageTitle: 'order.messageTitle',
  messageBody: 'order.messageBody',
  messageFooter: 'order.messageFooter',
  footerImage: 'order.footerImage',
}

interface BlockRect {
  key: string
  top: number
  bottom: number
  center: number
}

/** Base block keys in their current rendered order (customBlocks.N → customBlocks). */
function domOrder(): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  $('svg-host')
    .querySelectorAll('[data-re-block]')
    .forEach((g) => {
      const k = (g.getAttribute('data-re-block') || '').replace(/\.\d+$/, '')
      if (k && !seen.has(k)) {
        seen.add(k)
        order.push(k)
      }
    })
  return order
}

/** Per-base-block client-Y extents (union across multiple custom-block groups). */
function blockRects(): BlockRect[] {
  const acc = new Map<string, { top: number; bottom: number }>()
  const order: string[] = []
  $('svg-host')
    .querySelectorAll('[data-re-block]')
    .forEach((g) => {
      const k = (g.getAttribute('data-re-block') || '').replace(/\.\d+$/, '')
      const r = rectOf(g)
      const cur = acc.get(k)
      if (cur) {
        cur.top = Math.min(cur.top, r.top)
        cur.bottom = Math.max(cur.bottom, r.bottom)
      } else {
        acc.set(k, { top: r.top, bottom: r.bottom })
        order.push(k)
      }
    })
  return order.map((key) => {
    const e = acc.get(key)!
    return { key, top: e.top, bottom: e.bottom, center: (e.top + e.bottom) / 2 }
  })
}

function applyOrder(keys: string[]): void {
  ;(state.receipt as any).blockOrder = keys
  render()
  document.dispatchEvent(new Event('re:edit')) // persist via autosave (no input/change fires here)
}

// ---------------------------------------------------------------------------
// Canvas drag
// ---------------------------------------------------------------------------

let line: HTMLDivElement | null = null

function showLine(): void {
  if (line) return
  line = document.createElement('div')
  line.id = 're-insert-line'
  $('paper').appendChild(line)
}
function hideLine(): void {
  if (line) {
    line.remove()
    line = null
  }
}
function dimBlock(key: string, on: boolean): void {
  $('svg-host')
    .querySelectorAll('[data-re-block]')
    .forEach((g) => {
      const k = (g.getAttribute('data-re-block') || '').replace(/\.\d+$/, '')
      if (k === key) {
        if (on) g.setAttribute('opacity', '0.35')
        else g.removeAttribute('opacity')
      }
    })
}

/** Insertion index (0..n) for a client-Y among the current block centers. */
function insertionIndex(clientY: number, rects: BlockRect[]): number {
  let i = rects.findIndex((b) => clientY < b.center)
  return i < 0 ? rects.length : i
}

function positionLine(clientY: number, rects: BlockRect[]): void {
  showLine()
  if (!line) return
  const paper = rectOf($('paper'))
  const idx = insertionIndex(clientY, rects)
  const y = idx < rects.length ? rects[idx].top : rects[rects.length - 1].bottom
  // span the receipt content width using the SVG's box
  const svg = $('svg-host').querySelector('svg')
  const sr = svg ? rectOf(svg) : paper
  line.style.left = sr.left - paper.left + 'px'
  line.style.width = sr.width + 'px'
  line.style.top = y - paper.top + 'px'
}

// A floating frame around the block being dragged — follows the pointer so it's
// obvious what's moving.
let dragFrame: HTMLDivElement | null = null
function showDragFrame(key: string): void {
  hideDragFrame()
  const b = blockRects().find((r) => r.key === key)
  if (!b) return
  const paper = rectOf($('paper'))
  const svg = $('svg-host').querySelector('svg')
  const sr = svg ? rectOf(svg) : paper
  dragFrame = document.createElement('div')
  dragFrame.className = 're-drag-frame'
  dragFrame.style.left = sr.left - paper.left + 'px'
  dragFrame.style.width = sr.width + 'px'
  dragFrame.style.top = b.top - paper.top + 'px'
  dragFrame.style.height = b.bottom - b.top + 'px'
  $('paper').appendChild(dragFrame)
}
function moveDragFrame(dy: number): void {
  if (dragFrame) dragFrame.style.transform = `translateY(${dy}px)`
}
function hideDragFrame(): void {
  if (dragFrame) {
    dragFrame.remove()
    dragFrame = null
  }
}

export function beginCanvasGesture(e: PointerEvent): void {
  const t = e.target as Element | null
  const textId = (t?.closest('[data-re-id]') as Element | null)?.getAttribute('data-re-id') || null
  const blockKey =
    (t?.closest('[data-re-block]') as Element | null)?.getAttribute('data-re-block')?.replace(/\.\d+$/, '') ||
    null
  const host = $('svg-host')
  const startX = e.clientX
  const startY = e.clientY
  let started = false
  // NOTE: do NOT setPointerCapture here — capturing on every pointerdown ate the page's vertical
  // scroll on touch (the receipt fills the phone viewport). Capture only once a drag commits below.
  const move = (ev: PointerEvent): void => {
    if (!started) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // Only a deliberate, mostly-vertical drag starts a reorder — so a normal
      // click (or a small horizontal wobble) still reliably selects the text.
      if (blockKey && Math.abs(dy) > THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        started = true
        try {
          host.setPointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        ev.preventDefault()
        dimBlock(blockKey, true)
        showDragFrame(blockKey)
        clearSelection()
      } else {
        return
      }
    }
    ev.preventDefault()
    moveDragFrame(ev.clientY - startY)
    // Compute the insertion point among the OTHER blocks (excluding the one being
    // dragged) so the line shows exactly where it will land — no off-by-one.
    positionLine(ev.clientY, blockRects().filter((r) => r.key !== blockKey))
  }
  const cleanup = (ev: PointerEvent): void => {
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerup', up)
    host.removeEventListener('pointercancel', cancel)
    host.removeEventListener('lostpointercapture', cancel)
    try {
      host.releasePointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
    if (started && blockKey) {
      hideLine()
      hideDragFrame()
      dimBlock(blockKey, false)
    }
  }
  const up = (ev: PointerEvent): void => {
    const wasStarted = started
    cleanup(ev)
    if (wasStarted && blockKey) {
      const others = blockRects().filter((r) => r.key !== blockKey)
      const idx = insertionIndex(ev.clientY, others)
      const order = domOrder().filter((k) => k !== blockKey)
      order.splice(idx, 0, blockKey)
      applyOrder(order)
    } else if (!wasStarted) {
      // a tap (never a drag): style the text, or deselect on a gap
      if (textId) selectText(textId)
      else clearSelection()
    }
  }
  // a cancelled gesture (browser/app-switch, capture loss) must NOT commit a reorder or fire a tap
  const cancel = (ev: PointerEvent): void => cleanup(ev)
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', up)
  host.addEventListener('pointercancel', cancel)
  host.addEventListener('lostpointercapture', cancel)
}

// ---------------------------------------------------------------------------
// "版面順序" arrows panel (cross-device)
// ---------------------------------------------------------------------------

function move(key: string, dir: -1 | 1): void {
  const order = domOrder()
  const i = order.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  applyOrder(order)
}

// the panel is rebuilt on every move() (render → renderOrderPanel), which would drop keyboard focus
// to <body> after a press; remember the just-moved key+dir so we can re-focus its button in the new layout
let _pendingFocus: { key: string; dir: 'up' | 'down' } | null = null

export function renderOrderPanel(): void {
  const box = $('order-list')
  if (!box) return
  const order = domOrder()
  box.innerHTML = ''
  order.forEach((key, i) => {
    const label = LABELS[key] ? t(LABELS[key]) : key
    const row = document.createElement('div')
    row.className = 'order-row'
    row.dataset.key = key
    // aria-label carries the block name (the glyph alone reads as a bare "button"); the ↑↓ glyph
    // is decorative so hide it from AT
    row.innerHTML =
      '<span class="order-name">' + label + '</span>' +
      '<button class="order-btn" data-dir="up" aria-label="' + t('order.moveUp', { name: label }) + '"' +
      (i === 0 ? ' disabled' : '') + '><span aria-hidden="true">↑</span></button>' +
      '<button class="order-btn" data-dir="down" aria-label="' + t('order.moveDown', { name: label }) + '"' +
      (i === order.length - 1 ? ' disabled' : '') + '><span aria-hidden="true">↓</span></button>'
    const [upBtn, downBtn] = row.querySelectorAll('button')
    upBtn.addEventListener('click', () => {
      _pendingFocus = { key, dir: 'up' }
      move(key, -1)
    })
    downBtn.addEventListener('click', () => {
      _pendingFocus = { key, dir: 'down' }
      move(key, 1)
    })
    box.appendChild(row)
  })
  // restore keyboard focus to the moved row after the rebuild (fall back to the other arrow if the
  // preferred one is now disabled at an end), and announce the move
  if (_pendingFocus) {
    const { key, dir } = _pendingFocus
    _pendingFocus = null
    const row = box.querySelector<HTMLElement>(`.order-row[data-key="${key}"]`)
    if (row) {
      const pref = row.querySelector<HTMLButtonElement>(`button[data-dir="${dir}"]`)
      const alt = row.querySelector<HTMLButtonElement>(`button[data-dir="${dir === 'up' ? 'down' : 'up'}"]`)
      const target = pref && !pref.disabled ? pref : alt
      target?.focus()
      const name = row.querySelector('.order-name')?.textContent || key
      announce(t('order.moved', { name }))
    }
  }
}
