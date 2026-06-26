// Interactive overlay on top of the receipt SVG. Owns sticker handles, their
// drag (with alignment snapping), and a PS-style transform frame for the selected
// sticker: four corner handles to scale, a top handle to rotate, plus two-finger
// pinch (scale + rotate) on touch.
import { $, clientToReceipt, rectOf, scaleFactor, svgEl } from './dom'
import { clamp, isImg, state } from './state'
import { snapSticker, type Guide } from './snapping'
import { announce, prefersReducedMotion, vibrate } from './feel'
import { t } from './i18n'

// the next layoutOverlay() pops this sticker index in (set by addSticker/addStickerAt)
let _popIdx = -1
export function popSticker(i: number): void {
  _popIdx = i
}

const MIN_SIZE = 4
const MAX_SIZE = 4000 // effectively unlimited — let the user scale stickers freely

interface HandleEl extends HTMLDivElement {
  _img?: boolean
}

let onCommit: () => void = () => {}
export function setStickerCommit(fn: () => void): void {
  onCommit = fn
}
let onSelect: () => void = () => {}
export function setStickerSelect(fn: () => void): void {
  onSelect = fn
}
let onDelete: () => void = () => {}
export function setStickerDelete(fn: () => void): void {
  onDelete = fn
}

let frame: HTMLDivElement | null = null

// ---------------------------------------------------------------------------
// Coordinate mapping (receipt units -> px relative to #paper)
// ---------------------------------------------------------------------------

function mapToPaper(x: number, y: number): { l: number; t: number } {
  const s = svgEl()
  if (!s) return { l: 0, t: 0 }
  const r = rectOf(s)
  const pr = rectOf($('paper'))
  const k = scaleFactor()
  return { l: r.left - pr.left + x / k, t: r.top - pr.top + y / k }
}
function lenToPaper(len: number): number {
  return len / scaleFactor()
}
function others(i: number): { x: number; y: number }[] {
  const list: any[] = (state.receipt as any).stickers || []
  return list.filter((_, j) => j !== i).map((s) => ({ x: s.x || 0, y: s.y || 0 }))
}

export function placeEl(el: HandleEl, sk: any): void {
  const { l, t } = mapToPaper(sk.x || 0, sk.y || 0)
  el.style.left = l + 'px'
  el.style.top = t + 'px'
  el.style.transform = 'translate(-50%,-50%) rotate(' + (sk.rotation || 0) + 'deg)'
  const px = lenToPaper(sk.size || 38)
  if (el._img) {
    el.style.width = px + 'px'
    el.style.height = px + 'px'
  } else {
    el.style.fontSize = px + 'px'
  }
}

// ---------------------------------------------------------------------------
// Alignment guides
// ---------------------------------------------------------------------------

function clearGuides(): void {
  $('sticker-overlay')
    .querySelectorAll('.re-guide')
    .forEach((g) => g.remove())
}
// Guides are NEUTRAL by default (chrome ink); a fresh snap flashes them PINK (the
// reserved "committed" colour) via the .snap class — see drag handler below.
function drawGuides(guides: Guide[], pulse = false): void {
  clearGuides()
  const ov = $('sticker-overlay')
  for (const g of guides) {
    const line = document.createElement('div')
    line.className = 're-guide' + (pulse ? ' snap' : '')
    if (g.axis === 'x') {
      const { l } = mapToPaper(g.pos, 0)
      line.style.left = l + 'px'
      line.style.top = '0'
      line.style.width = '0'
      line.style.height = '100%'
      line.style.borderLeft = '1px dashed var(--ink-affordance)'
    } else {
      const { t } = mapToPaper(0, g.pos)
      line.style.top = t + 'px'
      line.style.left = '0'
      line.style.height = '0'
      line.style.width = '100%'
      line.style.borderTop = '1px dashed var(--ink-affordance)'
    }
    ov.appendChild(line)
  }
}

// ---------------------------------------------------------------------------
// Transform frame (corner scale + rotation handle) for the selected sticker
// ---------------------------------------------------------------------------

export function clearFrame(): void {
  if (frame) {
    frame.remove()
    frame = null
  }
}

function positionFrame(sk: any): void {
  if (!frame) return
  const { l, t } = mapToPaper(sk.x || 0, sk.y || 0)
  const px = Math.max(18, lenToPaper(sk.size || 38))
  frame.style.left = l + 'px'
  frame.style.top = t + 'px'
  frame.style.width = px + 'px'
  frame.style.height = px + 'px'
  frame.style.transform = 'translate(-50%,-50%) rotate(' + (sk.rotation || 0) + 'deg)'
  // when the sticker sits at the receipt's right/top edge, the delete(top-right) and
  // rotate(top) handles would land off-viewport (there is deliberately no horizontal scroll
  // to chase them) — flip them inward via edge classes (CSS in index.html). rect-safe.
  const r = frame.getBoundingClientRect()
  // wider thresholds on touch — the coarse handles are bigger and the 320px gutter is thinner,
  // so flip them inward sooner to keep × / rotate on-paper and off the masthead above
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  frame.classList.toggle('edge-r', r.right > window.innerWidth - (coarse ? 56 : 44))
  frame.classList.toggle('edge-t', r.top < (coarse ? 64 : 52))
}

/** Remove the currently-selected sticker (shared by the × handle's click/keydown and Delete key). */
export function deleteSelectedSticker(): void {
  const arr: any[] = (state.receipt as any).stickers
  if (!arr || state.sel < 0 || state.sel >= arr.length) return
  const removed = state.sel
  arr.splice(removed, 1)
  if (!arr.length) delete (state.receipt as any).stickers
  state.sel = -1
  state.selection = null
  clearFrame()
  announce(t('sticker.deleted'))
  onDelete() // re-renders (destroys the focused handle/×)
  // keep keyboard focus on a surviving node instead of dropping to <body> (WCAG 2.4.3): the handle
  // now at the deleted slot (or the previous one), else the sticker tray
  const ov = $('sticker-overlay')
  const next =
    ov.querySelector<HTMLElement>(`.sticker-handle[data-i="${removed}"]`) ||
    ov.querySelector<HTMLElement>(`.sticker-handle[data-i="${removed - 1}"]`) ||
    $('emoji-pick').querySelector<HTMLElement>('button') // no stickers left → the tray
  next?.focus()
}

function showFrameFor(sk: any): void {
  clearFrame()
  const ov = $('sticker-overlay')
  frame = document.createElement('div')
  frame.className = 're-frame'
  frame.innerHTML =
    '<div class="re-stem"></div>' +
    '<div class="re-h re-rot" data-role="rot" title="' + t('sticker.frame.rotate.title') + '"></div>' +
    '<div class="re-h re-del" data-role="del" role="button" tabindex="0" aria-label="' +
    t('sticker.frame.delete.title') +
    '" title="' + t('sticker.frame.delete.title') + '">×</div>' +
    '<div class="re-h re-c tl" data-role="scale"></div>' +
    '<div class="re-h re-c tr" data-role="scale"></div>' +
    '<div class="re-h re-c bl" data-role="scale"></div>' +
    '<div class="re-h re-c br" data-role="scale"></div>'
  ov.appendChild(frame)
  positionFrame(sk)

  // delete button — removes the selected sticker (mouse, touch, AND keyboard)
  const del = frame.querySelector<HTMLElement>('.re-del')
  if (del) {
    del.addEventListener('pointerdown', (e) => e.stopPropagation())
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteSelectedSticker()
    })
    del.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        deleteSelectedSticker()
      }
    })
  }

  const center = (): { cx: number; cy: number } => ({ cx: sk.x || 0, cy: sk.y || 0 })
  frame.querySelectorAll<HTMLElement>('.re-h:not(.re-del)').forEach((h) => {
    h.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.isPrimary === false) return
      e.preventDefault()
      e.stopPropagation()
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const role = h.dataset.role
      const move = (ev: PointerEvent): void => {
        // a concurrent render()/layoutOverlay() (theme/example switch mid-drag) can detach this
        // handle — bail and release so the pointer isn't left captured on a dead node
        if (!frame || !document.body.contains(h)) {
          up()
          return
        }
        const p = clientToReceipt(ev.clientX, ev.clientY)
        const { cx, cy } = center()
        if (role === 'scale') {
          const dist = Math.hypot(p.x - cx, p.y - cy)
          sk.size = clamp(Math.round(dist * Math.SQRT2), MIN_SIZE, MAX_SIZE)
        } else {
          let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
          deg = Math.round(((deg + 540) % 360) - 180)
          sk.rotation = deg
        }
        repositionSelected(sk)
      }
      let upDone = false
      const up = (): void => {
        if (upDone) return
        upDone = true
        try {
          h.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        h.removeEventListener('pointermove', move)
        h.removeEventListener('pointerup', up)
        h.removeEventListener('pointercancel', up)
        h.removeEventListener('lostpointercapture', up)
        onCommit()
      }
      h.addEventListener('pointermove', move)
      h.addEventListener('pointerup', up)
      h.addEventListener('pointercancel', up)
      h.addEventListener('lostpointercapture', up) // detached node still releases the gesture
    })
  })
}

/** Live-update the selected sticker's handle + frame during a transform. */
function repositionSelected(sk: any): void {
  const handle = $('sticker-overlay').querySelector<HandleEl>(
    `.sticker-handle[data-i="${state.sel}"]`,
  )
  if (handle) placeEl(handle, sk)
  positionFrame(sk)
}

let _nudgeT = 0
let _lastNudgeSnap = '' // last snap axes during keyboard nudge, so a held arrow doesn't re-strobe per press
/**
 * Keyboard arrow-nudge of the selected sticker. Updates the model + reuses the SAME snap pass
 * as dragging, repositions IN PLACE (so the focused handle survives → repeated presses work),
 * pulses the guide + haptic on a fresh snap, and announces the position to screen readers.
 */
export function nudgeSelected(dx: number, dy: number): void {
  const arr = (state.receipt as { stickers?: any[] }).stickers
  const i = state.sel
  if (!arr || !arr[i]) return
  const sk = arr[i]
  const sv = svgEl()
  if (!sv) return
  const vb = sv.viewBox.baseVal
  const rawX = clamp((sk.x || 0) + dx, 0, vb.width)
  const rawY = clamp((sk.y || 0) + dy, 0, vb.height)
  const snapped = snapSticker(rawX, rawY, { width: vb.width, height: vb.height, others: others(i) })
  sk.x = snapped.x
  sk.y = snapped.y
  repositionSelected(sk)
  // only pulse the guide + haptic on a FRESH snap (mirrors the drag path) — otherwise holding an arrow
  // while resting on a guide strobes the pink line + buzzes nonstop every keypress
  const key = snapped.guides
    .map((g) => g.axis)
    .sort()
    .join(',')
  const fresh = key !== '' && key !== _lastNudgeSnap
  _lastNudgeSnap = key
  drawGuides(snapped.guides, fresh)
  if (fresh) vibrate(8)
  window.setTimeout(() => clearGuides(), 280)
  // keep keyboard focus ON the handle so the next arrow press keeps nudging (was lost when the
  // whole overlay got rebuilt)
  $('sticker-overlay').querySelector<HTMLElement>(`.sticker-handle[data-i="${i}"]`)?.focus()
  // debounced position announce (coords are language-neutral; held keys don't spam the SR)
  window.clearTimeout(_nudgeT)
  _nudgeT = window.setTimeout(() => announce(`${Math.round(sk.x)}, ${Math.round(sk.y)}`), 250)
  onCommit()
}

// ---------------------------------------------------------------------------
// Build handles + body drag + pinch
// ---------------------------------------------------------------------------

function makeHandle(sk: any, i: number): HandleEl {
  const el = document.createElement('div') as HandleEl
  el.className = 'sticker-handle' + (i === state.sel ? ' sel' : '')
  el.dataset.i = String(i)
  // keyboard-reachable: Tab to a sticker focuses+selects it; arrow keys then nudge it (see main.ts)
  el.tabIndex = 0
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', t('panel.stickers.title') + ' ' + (i + 1)) // distinct + countable by ear
  el.addEventListener('focus', () => {
    if (state.sel !== i) select(i)
  })
  if (isImg(sk.content)) {
    const im = document.createElement('img')
    im.src = sk.content
    el.appendChild(im)
    el._img = true
  } else {
    el.textContent = sk.content
  }
  return el
}

function select(i: number): void {
  // a focus event can arrive on a handle whose index was valid only for the previous
  // render (delete + re-render race) — bail safely instead of dereferencing undefined
  const arr = (state.receipt as { stickers?: unknown[] }).stickers
  if (!arr || !arr[i]) {
    state.sel = -1
    state.selection = null
    clearFrame()
    return
  }
  state.sel = i
  state.selection = { kind: 'sticker', index: i }
  document.querySelectorAll('.sticker-handle').forEach((h) => {
    h.classList.toggle('sel', (h as HTMLElement).dataset.i === String(i))
  })
  onSelect()
  showFrameFor(arr[i])
}

function attachPointer(el: HandleEl, sk: any, i: number): void {
  const pts = new Map<number, { x: number; y: number }>()
  let pinch: { dist: number; ang: number; size: number; rot: number } | null = null
  let grab = { dx: 0, dy: 0 }

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    // Always (re)select on press so the transform frame is guaranteed to show —
    // even if this sticker is already state.sel but its frame isn't built yet
    // (e.g. just added). showFrameFor rebuilds idempotently.
    const framed =
      state.selection?.kind === 'sticker' && state.selection.index === i && !!frame
    if (!framed) select(i)
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.style.cursor = 'grabbing'
    if (pts.size === 1) {
      const down = clientToReceipt(e.clientX, e.clientY)
      grab = { dx: (sk.x || 0) - down.x, dy: (sk.y || 0) - down.y }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        size: sk.size || 38,
        rot: sk.rotation || 0,
      }
    }

    let lastSnap = ''
    const move = (ev: PointerEvent): void => {
      if (!document.body.contains(el)) {
        up(ev)
        return
      } // handle detached by a mid-drag render() — release instead of leaking the capture
      if (!pts.has(ev.pointerId)) return
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        sk.size = clamp(Math.round((pinch.size * dist) / (pinch.dist || 1)), MIN_SIZE, MAX_SIZE)
        sk.rotation = Math.round(((pinch.rot + (ang - pinch.ang) + 540) % 360) - 180)
        repositionSelected(sk)
      } else {
        const sv = svgEl()
        if (!sv) return // a concurrent render() tore down the SVG mid-drag — don't throw
        const p = clientToReceipt(ev.clientX, ev.clientY)
        const vb = sv.viewBox.baseVal
        const rawX = clamp(p.x + grab.dx, 0, vb.width)
        const rawY = clamp(p.y + grab.dy, 0, vb.height)
        const snapped = snapSticker(rawX, rawY, {
          width: vb.width,
          height: vb.height,
          others: others(i),
        })
        sk.x = snapped.x
        sk.y = snapped.y
        placeEl(el, sk)
        positionFrame(sk)
        // snap-confirm: pulse the guide pink + a haptic tap only on the FRESH snap onset
        const key = snapped.guides.map((g) => g.axis).sort().join(',')
        const fresh = key !== '' && key !== lastSnap
        drawGuides(snapped.guides, fresh)
        if (fresh) vibrate(8)
        lastSnap = key
      }
    }
    const up = (ev: PointerEvent): void => {
      pts.delete(ev.pointerId)
      try {
        el.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      if (pts.size < 2) pinch = null
      if (pts.size === 0) {
        el.style.cursor = 'grab'
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        el.removeEventListener('lostpointercapture', up)
        clearGuides()
        onCommit()
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up) // detached node still releases the gesture
  })
}

export function layoutOverlay(): void {
  const ov = $('sticker-overlay')
  ov.innerHTML = ''
  frame = null
  if (!svgEl()) return
  const stickers: any[] = (state.receipt as any).stickers || []
  stickers.forEach((sk, i) => {
    const el = makeHandle(sk, i)
    placeEl(el, sk)
    attachPointer(el, sk, i)
    ov.appendChild(el)
    if (i === _popIdx && !prefersReducedMotion() && typeof el.animate === 'function') {
      el.animate(
        [
          { transform: el.style.transform + ' scale(.4)', opacity: 0 },
          { transform: el.style.transform + ' scale(1)', opacity: 1 },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' },
      )
    }
  })
  _popIdx = -1
  if (state.selection?.kind === 'sticker') {
    const i = state.selection.index
    if (stickers[i]) showFrameFor(stickers[i])
  }
}
