// Shared "feel" foundation — reduced-motion guard, haptics, a polite screen-reader
// announcement channel, and focus-trap helpers. Every motion / sound / print feature
// consumes this, so the accessibility + reduced-motion behaviour is implemented ONCE.
// Note: MOTION is gated on prefers-reduced-motion; SOUND is not (it has its own mute).

let _rm: MediaQueryList | null = null
export function prefersReducedMotion(): boolean {
  try {
    if (!_rm) _rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    return _rm.matches
  } catch {
    return false
  }
}

/** Best-effort haptic tap. No-op where unsupported (e.g. iOS Safari). Never gated on reduced-motion. */
export function vibrate(ms = 8): void {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    if (typeof nav.vibrate === 'function') nav.vibrate(ms)
  } catch {
    /* ignore */
  }
}

// --- polite live region: routes every new toast / status / result to assistive tech ---
let _live: HTMLElement | null = null
function liveRegion(): HTMLElement | null {
  if (!_live) _live = document.getElementById('re-live')
  return _live
}
/** Announce a status message to assistive tech (errors, undo, print/snap state, share result). */
export function announce(msg: string): void {
  const el = liveRegion()
  if (!el || !msg) return
  el.textContent = ''
  // a fresh frame so identical consecutive messages are still announced
  window.requestAnimationFrame(() => {
    el.textContent = msg
  })
}

// --- transient toast (visible confirmation) + always routes through announce() for AT ---
let _toastT = 0
export function toast(msg: string): void {
  announce(msg)
  let el = document.getElementById('re-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 're-toast'
    el.className = 're-toast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = msg
  // reflow so the show transition re-fires on rapid repeats
  void el.offsetWidth
  el.classList.add('show')
  window.clearTimeout(_toastT)
  _toastT = window.setTimeout(() => el && el.classList.remove('show'), 2400)
}

// --- focus management for modal surfaces (handoff present-mode, etc.) ---
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
let _trapEl: HTMLElement | null = null
let _trapPrev: HTMLElement | null = null
let _trapHandler: ((e: KeyboardEvent) => void) | null = null

/** Trap Tab focus inside a modal container and remember what to restore on release. */
export function trapFocus(container: HTMLElement): void {
  releaseFocus() // only one trap at a time
  _trapEl = container
  _trapPrev = document.activeElement as HTMLElement | null
  const items = (): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null)
  items()[0]?.focus()
  _trapHandler = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    const f = items()
    if (!f.length) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  container.addEventListener('keydown', _trapHandler)
}

/** Release the active focus trap and restore focus to the triggering element. */
export function releaseFocus(): void {
  if (_trapEl && _trapHandler) _trapEl.removeEventListener('keydown', _trapHandler)
  _trapHandler = null
  _trapEl = null
  const prev = _trapPrev
  _trapPrev = null
  try {
    prev?.focus()
  } catch {
    /* ignore */
  }
}
