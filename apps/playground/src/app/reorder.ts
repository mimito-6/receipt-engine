// Phase 3 — block reordering. Two ways, both writing state.receipt.blockOrder:
//   1) Canvas: press a section and drag it up/down (insertion line shows where it
//      lands). A press without movement falls through to text selection.
//   2) A "版面順序" panel with up/down arrows — reliable on every device (esp. touch,
//      where a drag would fight page scroll).
import { $, rectOf } from './dom'
import { state } from './state'
import { render } from './render'
import { clearSelection, selectText } from './inspector'

const THRESHOLD = 7 // px of movement before a press becomes a block drag

const LABELS: Record<string, string> = {
  header: '店頭(店名 / Logo)',
  event: '攤位 / 活動',
  transaction: '交易資訊',
  items: '品項',
  discounts: '折扣',
  totals: '金額合計',
  payments: '付款',
  qr: 'QR 條碼',
  customBlocks: '自訂區塊',
  message: '結尾訊息',
  footerImage: '頁尾圖',
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
  try {
    host.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const move = (ev: PointerEvent): void => {
    if (!started) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // Only a deliberate, mostly-vertical drag starts a reorder — so a normal
      // click (or a small horizontal wobble) still reliably selects the text.
      if (blockKey && Math.abs(dy) > THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        started = true
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
    positionLine(ev.clientY, blockRects())
  }
  const up = (ev: PointerEvent): void => {
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerup', up)
    host.removeEventListener('pointercancel', up)
    try {
      host.releasePointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
    if (started && blockKey) {
      const rects = blockRects()
      const order = rects.map((r) => r.key)
      const from = order.indexOf(blockKey)
      const to = insertionIndex(ev.clientY, rects)
      hideLine()
      hideDragFrame()
      dimBlock(blockKey, false)
      if (from >= 0) {
        order.splice(from, 1)
        order.splice(to > from ? to - 1 : to, 0, blockKey)
        applyOrder(order)
      }
    } else {
      // a tap: style the text, or deselect on a gap
      if (textId) selectText(textId)
      else clearSelection()
    }
  }
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', up)
  host.addEventListener('pointercancel', up)
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

export function renderOrderPanel(): void {
  const box = $('order-list')
  if (!box) return
  const order = domOrder()
  box.innerHTML = ''
  order.forEach((key, i) => {
    const row = document.createElement('div')
    row.className = 'order-row'
    row.innerHTML =
      '<span class="order-name">' + (LABELS[key] || key) + '</span>' +
      '<button class="order-btn" data-dir="up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="order-btn" data-dir="down"' + (i === order.length - 1 ? ' disabled' : '') + '>↓</button>'
    const [upBtn, downBtn] = row.querySelectorAll('button')
    upBtn.addEventListener('click', () => move(key, -1))
    downBtn.addEventListener('click', () => move(key, 1))
    box.appendChild(row)
  })
}
