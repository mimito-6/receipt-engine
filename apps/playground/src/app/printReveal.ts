// The signature "print" ceremony — the finished receipt feeds out of a believable
// printer mouth. This is CHROME ONLY: it animates a clone of the already-rendered
// SVG in a modal layer, and never touches #paper, the overlays, or the export path,
// so exports stay byte-deterministic. Reduced-motion / fast-mode get an EQUIVALENT
// (instant + announced) result, not silence.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { $ } from './dom'
import { esc, state } from './state'
import { exportOpts } from './io'
import { announce, prefersReducedMotion, releaseFocus, setEditorInert, trapFocus, vibrate } from './feel'
import { playDing, playWhir } from './sound'
import { t } from './i18n'

const FAST_KEY = 're-fast-print'
export function fastPrint(): boolean {
  try {
    return localStorage.getItem(FAST_KEY) === '1'
  } catch {
    return false
  }
}
export function setFastPrint(v: boolean): void {
  try {
    if (v) localStorage.setItem(FAST_KEY, '1')
    else localStorage.removeItem(FAST_KEY)
  } catch {
    /* ignore */
  }
}

let playing = false
export function isPrintPlaying(): boolean {
  return playing
}

/**
 * Play the print-feed ceremony for the CURRENT receipt, then resolve.
 * Always resolves (callers run the real export/share/print on completion).
 */
export function playPrintReveal(): Promise<void> {
  const src = $('svg-host').querySelector('svg')
  // Equivalent result (not silence) when motion is off / fast mode / already playing.
  if (!src || playing || prefersReducedMotion() || fastPrint()) {
    announce(t('print.done'))
    return Promise.resolve()
  }
  playing = true
  vibrate(6)
  return new Promise<void>((resolve) => {
    const stage = document.createElement('div')
    stage.className = 'print-stage'
    // a transient modal (like handoff): announce it, make Esc/tap-to-skip discoverable, and hide
    // the editor behind it from AT for the ~1.8s it's up
    stage.setAttribute('role', 'dialog')
    stage.setAttribute('aria-modal', 'true')
    stage.tabIndex = -1
    stage.setAttribute('aria-label', t('print.printing') + ' · ' + t('print.skip'))
    stage.innerHTML =
      `<div class="print-status" id="print-status">${esc(t('print.warming'))}</div>` +
      '<div class="print-machine"><div class="print-mouth"></div>' +
      '<div class="print-paper-wrap"><div class="print-paper"></div></div></div>' +
      `<button type="button" class="print-skip">${esc(t('print.skip'))}</button>`
    document.body.appendChild(stage)
    // make the editor behind the ceremony inert (focus-blocking + AT-hidden), restored in finish()
    setEditorInert(true)
    // trap focus for the ceremony's lifetime (the skip button is the anchor) so Tab can't reach
    // the now-aria-hidden editor; releaseFocus() in finish() returns focus to the export button
    trapFocus(stage)
    // render the SAME receipt the export/handoff show (WITH stickers) — the editor SVG strips
    // them, so cloning it would "print" a different receipt than the one you download
    const paperEl = stage.querySelector('.print-paper') as HTMLElement
    try {
      paperEl.innerHTML = renderReceiptToSvg(state.receipt as never, exportOpts({}) as never)
    } catch {
      paperEl.appendChild(src.cloneNode(true)) // fall back to the live SVG if a render throws
    }
    // a tall (20+ item) receipt would be clipped by the .print-paper-wrap max-height — scale the
    // CLONE to fit so the ceremony "prints" the WHOLE receipt that downloads (transform on the
    // modal clone only, never #paper → rect-safe)
    const svgH = (paperEl.querySelector('svg') as SVGSVGElement | null)?.getBoundingClientRect().height || 0
    if (svgH > 700) {
      paperEl.style.transformOrigin = 'top center'
      paperEl.style.transform = `scale(${(700 / svgH).toFixed(3)})`
    }
    const status = stage.querySelector('#print-status') as HTMLElement

    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      window.removeEventListener('keydown', onKey)
      releaseFocus() // restore focus to the export button that opened the ceremony
      setEditorInert(false)
      stage.classList.add('out')
      announce(t('print.done'))
      window.setTimeout(() => {
        stage.remove()
        playing = false
        resolve()
      }, 220)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish()
    }
    stage.addEventListener('pointerdown', finish)
    // keyboard: Enter/Space on the trapped skip button fires click (not pointerdown)
    stage.querySelector('.print-skip')?.addEventListener('click', finish)
    window.addEventListener('keydown', onKey)

    window.requestAnimationFrame(() => {
      stage.classList.add('in')
      window.setTimeout(() => {
        status.textContent = t('print.printing')
        announce(t('print.printing'))
        stage.classList.add('feeding')
        vibrate(10)
        playWhir(1.05)
      }, 420)
    })
    // feed finished: a soft ding + a tiny tear-off settle (WAAPI so it composes over, not
    // fights, the CSS feed animation) so the ceremony lands instead of trailing into dead air
    window.setTimeout(() => {
      if (done) return
      playDing()
      vibrate(12)
      if (!prefersReducedMotion() && typeof paperEl.animate === 'function') {
        paperEl.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }],
          { duration: 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
        )
      }
    }, 1480)
    // resolve after warming (420) + feed (1050) + settle (330)
    window.setTimeout(finish, 1800)
  })
}
