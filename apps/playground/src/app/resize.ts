// Phase 3 — boundary drag resize. Hover near the card's edges to reveal thin
// handles: drag the right edge to change width, the top edge for top padding,
// the bottom edge for bottom padding. Lives in its own #edge-overlay (not the
// sticker overlay) so it survives the re-render mid-drag.
import { $, receiptLen, receiptToPaper, scaleFactor, svgEl } from './dom'
import { clamp, curPad, state } from './state'
import { render } from './render'
import { t } from './i18n'

let host: HTMLDivElement | null = null
let rightH: HTMLDivElement
let topH: HTMLDivElement
let botH: HTMLDivElement

interface Geom {
  width: number
  height: number
  cardLeft: number
  cardRight: number
  cardTop: number
  cardBottom: number
}

function geom(): Geom | null {
  const s = svgEl()
  if (!s) return null
  const vb = s.viewBox.baseVal
  const om = state.theme === 'thermal' ? 22 : 26 // outerMargin (mirrors render-svg)
  return {
    width: vb.width,
    height: vb.height,
    cardLeft: om,
    cardRight: vb.width - om,
    cardTop: om,
    cardBottom: vb.height - om,
  }
}

function syncSlider(id: string, valId: string, v: number, suffix = 'px'): void {
  ;($(id) as HTMLInputElement).value = String(v)
  $(valId).textContent = v + suffix
}

function dragWidth(el: HTMLElement): void {
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    el.classList.add('on')
    const k = scaleFactor()
    const startW = state.width[state.theme]
    const startX = e.clientX
    const move = (ev: PointerEvent): void => {
      const d = (ev.clientX - startX) * k
      state.width[state.theme] = clamp(Math.round(startW + d * 2), 280, 900)
      syncSlider('s-width', 'v-width', state.width[state.theme])
      render()
    }
    const up = (): void => {
      el.classList.remove('on')
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  })
}

function dragPad(el: HTMLElement, which: 'top' | 'bottom'): void {
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    el.classList.add('on')
    const k = scaleFactor()
    const start = which === 'top' ? curPad().top : curPad().bottom
    const startY = e.clientY
    const move = (ev: PointerEvent): void => {
      const d = (ev.clientY - startY) * k
      const v = clamp(Math.round(start + d), 0, 320)
      if (which === 'top') {
        curPad().top = v
        syncSlider('s-padtop', 'v-padtop', v)
      } else {
        curPad().bottom = v
        syncSlider('s-padbottom', 'v-padbottom', v)
      }
      render()
    }
    const up = (): void => {
      el.classList.remove('on')
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  })
}

export function installEdgeHandles(): void {
  if (host) return
  host = document.createElement('div')
  host.id = 'edge-overlay'
  rightH = document.createElement('div')
  rightH.className = 're-edge re-edge-r'
  rightH.title = t('edge.width.title')
  rightH.setAttribute('data-i18n-title', 'edge.width.title')
  topH = document.createElement('div')
  topH.className = 're-edge re-edge-t'
  topH.title = t('edge.padTop.title')
  topH.setAttribute('data-i18n-title', 'edge.padTop.title')
  botH = document.createElement('div')
  botH.className = 're-edge re-edge-b'
  botH.title = t('edge.padBottom.title')
  botH.setAttribute('data-i18n-title', 'edge.padBottom.title')
  host.append(rightH, topH, botH)
  $('paper').appendChild(host)
  dragWidth(rightH)
  dragPad(topH, 'top')
  dragPad(botH, 'bottom')
  positionEdgeHandles()
}

export function positionEdgeHandles(): void {
  if (!host) return
  const g = geom()
  if (!g) {
    host.style.display = 'none'
    return
  }
  host.style.display = ''
  const w = receiptLen(g.cardRight - g.cardLeft)
  const h = receiptLen(g.cardBottom - g.cardTop)
  const r = receiptToPaper(g.cardRight, g.cardTop)
  rightH.style.left = r.l + 'px'
  rightH.style.top = r.t + 'px'
  rightH.style.height = h + 'px'
  const tp = receiptToPaper(g.cardLeft, g.cardTop)
  topH.style.left = tp.l + 'px'
  topH.style.top = tp.t + 'px'
  topH.style.width = w + 'px'
  const bp = receiptToPaper(g.cardLeft, g.cardBottom)
  botH.style.left = bp.l + 'px'
  botH.style.top = bp.t + 'px'
  botH.style.width = w + 'px'
}
