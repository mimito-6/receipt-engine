// The interactive overlay drawn on top of the receipt SVG. Owns sticker handles
// and their drag while editing. Phase 2+ extends this with PS-style transform.
import { $, clientToReceipt, rectOf, scaleFactor, svgEl } from './dom'
import { clamp, isImg, state } from './state'

interface HandleEl extends HTMLDivElement {
  _img?: boolean
}

/** Position a sticker handle over the SVG at the sticker's receipt coordinates. */
export function placeEl(el: HandleEl, sk: any): void {
  const s = svgEl()
  if (!s) return
  const r = rectOf(s)
  const pr = rectOf($('paper'))
  const k = scaleFactor()
  el.style.left = r.left - pr.left + (sk.x || 0) / k + 'px'
  el.style.top = r.top - pr.top + (sk.y || 0) / k + 'px'
  el.style.transform = 'translate(-50%,-50%) rotate(' + (sk.rotation || 0) + 'deg)'
  const px = (sk.size || 38) / k
  if (el._img) {
    el.style.width = px + 'px'
    el.style.height = px + 'px'
  } else {
    el.style.fontSize = px + 'px'
  }
}

/** Called after a sticker drag commits (set by main to refresh the side list + JSON). */
let onCommit: () => void = () => {}
export function setStickerCommit(fn: () => void): void {
  onCommit = fn
}
/** Called when a sticker becomes selected (set by main to refresh the side list). */
let onSelect: () => void = () => {}
export function setStickerSelect(fn: () => void): void {
  onSelect = fn
}

/** Rebuild the whole overlay from state (sticker handles for now). */
export function layoutOverlay(): void {
  const ov = $('sticker-overlay')
  ov.innerHTML = ''
  if (!svgEl()) return
  const stickers: any[] = state.receipt?.stickers || []
  stickers.forEach((sk, i) => {
    const el = document.createElement('div') as HandleEl
    el.className = 'sticker-handle' + (i === state.sel ? ' sel' : '')
    el.dataset.i = String(i)
    if (isImg(sk.content)) {
      const im = document.createElement('img')
      im.src = sk.content
      el.appendChild(im)
      el._img = true
    } else {
      el.textContent = sk.content
    }
    placeEl(el, sk)
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.isPrimary === false) return
      e.preventDefault()
      state.sel = i
      state.selection = { kind: 'sticker', index: i }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      el.style.cursor = 'grabbing'
      document
        .querySelectorAll('.sticker-handle')
        .forEach((h) => h.classList.toggle('sel', h === el))
      onSelect()
      const down = clientToReceipt(e.clientX, e.clientY)
      const grab = { dx: (sk.x || 0) - down.x, dy: (sk.y || 0) - down.y }
      const move = (ev: PointerEvent): void => {
        const p = clientToReceipt(ev.clientX, ev.clientY)
        const vb = svgEl()!.viewBox.baseVal
        sk.x = clamp(p.x + grab.dx, 0, vb.width)
        sk.y = clamp(p.y + grab.dy, 0, vb.height)
        placeEl(el, sk)
      }
      const up = (): void => {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        el.style.cursor = 'grab'
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        onCommit()
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    })
    ov.appendChild(el)
  })
}
