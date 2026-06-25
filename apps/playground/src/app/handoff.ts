// Customer Handoff present-mode — "turn the phone to the customer". A full-screen modal
// that shows the CLEAN, finished receipt (rendered via exportOpts, so present == export ==
// print), feeds it in with the print ceremony, and offers Share / Save. role=dialog +
// aria-modal + focus-trap + Esc / Android-back to exit. Chrome-only: never mutates the
// editor model or the export path.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { $, dl } from './dom'
import { esc, state } from './state'
import { exportOpts } from './io'
import { receiptPngBlob } from './pngExport'
import { announce, prefersReducedMotion, releaseFocus, toast, trapFocus } from './feel'
import { playDing, playWhir, primeAudio } from './sound'
import { isPrintPlaying } from './printReveal'
import { t } from './i18n'

let openEl: HTMLElement | null = null
export function isHandoffOpen(): boolean {
  return !!openEl
}

// single-flight: a 20-item PNG raster takes >1s on a phone — a double-tap must not fire
// two save-sheets / a second navigator.share (which rejects with InvalidStateError)
let handoffBusy = false

async function saveReceipt(): Promise<void> {
  if (handoffBusy) return
  handoffBusy = true
  primeAudio()
  try {
    dl('receipt.png', await receiptPngBlob())
    toast(t('handoff.savedHint'))
  } catch {
    /* ignore (e.g. tainted canvas from a cross-origin image) */
  } finally {
    handoffBusy = false
  }
}

async function shareReceipt(): Promise<void> {
  if (handoffBusy) return
  handoffBusy = true
  primeAudio()
  let blob: Blob
  try {
    blob = await receiptPngBlob()
  } catch {
    handoffBusy = false
    return
  }
  try {
    const file = new File([blob], 'receipt.png', { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
    if (typeof navigator.share === 'function' && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('handoff.shareTitle') })
        toast(t('handoff.shared'))
      } catch {
        /* user dismissed the share sheet — no-op */
      }
      return
    }
    // no Web Share for files (desktop / some iOS) → download + a save hint
    dl('receipt.png', blob)
    announce(t('handoff.savedHint'))
  } finally {
    handoffBusy = false
  }
}

function teardown(): void {
  if (!openEl) return
  const el = openEl
  openEl = null
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('popstate', onPop)
  releaseFocus()
  ;[document.querySelector('.layout'), document.querySelector('header')].forEach((b) => b?.removeAttribute('aria-hidden'))
  el.classList.add('out')
  window.setTimeout(() => el.remove(), 220)
}

export function closeHandoff(): void {
  if (!openEl) return
  // pop our own history entry (which triggers onPop → teardown); fall back to direct teardown
  let popped = false
  try {
    if (history.state && (history.state as { handoff?: boolean }).handoff) {
      history.back()
      popped = true
    }
  } catch {
    /* ignore */
  }
  if (!popped) teardown()
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeHandoff()
}
function onPop(): void {
  // Android / browser back → close the modal, not the app
  teardown()
}

export function openHandoff(): void {
  if (openEl || isPrintPlaying()) return // never stack on top of the print ceremony (one modal, one focus trap)
  primeAudio()
  const ov = document.createElement('div')
  openEl = ov
  ov.className = 'handoff'
  ov.setAttribute('role', 'dialog')
  ov.setAttribute('aria-modal', 'true')
  ov.setAttribute('aria-label', t('handoff.title'))
  ov.innerHTML =
    `<button class="handoff-x" aria-label="${esc(t('handoff.close'))}">×</button>` +
    `<div class="handoff-title">${esc(t('handoff.title'))}</div>` +
    '<div class="handoff-paper-wrap"><div class="handoff-paper"></div></div>' +
    '<div class="handoff-actions">' +
    `<button class="handoff-act primary" id="handoff-share">${esc(t('handoff.share'))}</button>` +
    `<button class="handoff-act" id="handoff-save">${esc(t('handoff.save'))}</button>` +
    '</div>'
  document.body.appendChild(ov)
  // hide the editor from assistive tech while the present-mode modal is up
  ;[document.querySelector('.layout'), document.querySelector('header')].forEach((b) =>
    b?.setAttribute('aria-hidden', 'true'),
  )

  // clean render == exactly what exports / prints (exportOpts, NOT the interactive editor SVG)
  const svg = renderReceiptToSvg(state.receipt as never, exportOpts({}) as never)
  ;(ov.querySelector('.handoff-paper') as HTMLElement).innerHTML = svg

  // reveal-in with the print ceremony (equivalent instant state under reduced motion)
  if (prefersReducedMotion()) {
    ov.classList.add('in', 'shown')
    announce(t('print.done'))
  } else {
    window.requestAnimationFrame(() => {
      ov.classList.add('in')
      window.setTimeout(() => {
        ov.classList.add('feeding')
        playWhir(1.05)
        window.setTimeout(() => playDing(), 1080)
      }, 260)
    })
  }

  ov.querySelector('.handoff-x')!.addEventListener('click', () => closeHandoff())
  ov.addEventListener('pointerdown', (e) => {
    if (e.target === ov) closeHandoff()
  })
  ov.querySelector('#handoff-share')!.addEventListener('click', () => void shareReceipt())
  ov.querySelector('#handoff-save')!.addEventListener('click', () => void saveReceipt())
  window.addEventListener('keydown', onKey)
  // history entry so Android back closes the modal instead of leaving the app
  try {
    history.pushState({ handoff: true }, '')
    window.addEventListener('popstate', onPop)
  } catch {
    /* ignore */
  }
  trapFocus(ov)
}
