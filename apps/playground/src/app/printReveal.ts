// The signature "print" ceremony — the finished receipt feeds out of a believable
// printer mouth. This is CHROME ONLY: it animates a clone of the already-rendered
// SVG in a modal layer, and never touches #paper, the overlays, or the export path,
// so exports stay byte-deterministic. Reduced-motion / fast-mode get an EQUIVALENT
// (instant + announced) result, not silence.
import { $ } from './dom'
import { esc } from './state'
import { announce, prefersReducedMotion, vibrate } from './feel'
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
    stage.setAttribute('role', 'status')
    stage.setAttribute('aria-label', t('print.printing'))
    stage.innerHTML =
      `<div class="print-status" id="print-status">${esc(t('print.warming'))}</div>` +
      '<div class="print-machine"><div class="print-mouth"></div>' +
      '<div class="print-paper-wrap"><div class="print-paper"></div></div></div>' +
      `<div class="print-skip">${esc(t('print.skip'))}</div>`
    document.body.appendChild(stage)
    ;(stage.querySelector('.print-paper') as HTMLElement).appendChild(src.cloneNode(true))
    const status = stage.querySelector('#print-status') as HTMLElement

    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      window.removeEventListener('keydown', onKey)
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
    // a soft completion ding when the feed finishes (a skipped run won't ding)
    window.setTimeout(() => {
      if (!done) playDing()
    }, 1480)
    // resolve after warming (420) + feed (1050) + settle (330)
    window.setTimeout(finish, 1800)
  })
}
