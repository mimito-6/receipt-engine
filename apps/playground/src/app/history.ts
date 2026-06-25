// Undo / redo. A linear timeline of design snapshots with a pointer. Every render
// schedules a (debounced, de-duped) snapshot, so a whole slider drag or a burst of
// typing collapses into one history step. Applying a snapshot suppresses recording.
import { render } from './render'
import { state } from './state'
import { syncFormFromState } from './form'
import { announce } from './feel'
import { t } from './i18n'

let timeline: string[] = []
let index = -1
let timer: ReturnType<typeof setTimeout> | null = null
let applying = false

/** Everything that makes up the design (mirrors buildConfig minus meta). */
function snapshot(): string {
  return JSON.stringify({
    theme: state.theme,
    receipt: state.receipt,
    look: state.look,
    width: state.width,
    pad: state.pad,
    mono: state.mono,
    edges: state.edges,
    // NOTE: scale (zoom) is intentionally NOT here — it's a viewport setting, not part
    // of the design, so undo/redo must not snap the user's zoom around. It still
    // persists via buildConfig. (The s-scale slider deliberately doesn't record history.)
  })
}

function updateButtons(): void {
  const u = document.getElementById('undo') as HTMLButtonElement | null
  const r = document.getElementById('redo') as HTMLButtonElement | null
  if (u) u.disabled = index <= 0
  if (r) r.disabled = index >= timeline.length - 1
}

/** Start a fresh timeline (call after loadExample / applyConfig). */
export function resetHistory(): void {
  if (timer) clearTimeout(timer)
  timer = null
  timeline = [snapshot()]
  index = 0
  updateButtons()
}

/** Debounced: record a snapshot once edits settle (≈350ms). No-op while applying. */
export function scheduleHistory(): void {
  if (applying) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    commit()
  }, 350)
}

// hard caps: 80 steps OR ~12MB of serialized snapshots, whichever bites first. An image-laden
// design embeds base64 logo/background/stickers in EVERY snapshot, so the byte cap (not the
// count) is what keeps a long editing session off the OOM path on a phone.
const MAX_STEPS = 80
const MAX_BYTES = 12 * 1024 * 1024
function commit(): void {
  const snap = snapshot()
  if (index >= 0 && timeline[index] === snap) return // nothing actually changed
  timeline = timeline.slice(0, index + 1)
  timeline.push(snap)
  if (timeline.length > MAX_STEPS) timeline = timeline.slice(timeline.length - MAX_STEPS)
  // drop oldest entries until the retained snapshots fit the byte budget (always keep >=1)
  let bytes = timeline.reduce((n, s) => n + s.length, 0)
  while (timeline.length > 1 && bytes > MAX_BYTES) {
    bytes -= timeline[0]!.length
    timeline.shift()
  }
  index = timeline.length - 1
  updateButtons()
}

function flushPending(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
    commit()
  }
}

function apply(json: string, dir?: 'undo' | 'redo'): void {
  const s = JSON.parse(json)
  state.theme = s.theme
  state.receipt = s.receipt
  state.look = s.look
  state.width = s.width
  state.pad = s.pad
  state.mono = s.mono
  state.edges = s.edges ?? { custom: false, thermal: true }
  state.sel = -1
  state.selection = null
  applying = true
  try {
    syncFormFromState()
    render()
  } finally {
    applying = false
  }
  // undo/redo are otherwise a silent hard-cut — confirm the change with the rect-safe
  // opacity flash (same trick as setTheme) + a screen-reader announce
  const h = document.getElementById('svg-host')
  if (h) {
    h.classList.remove('theme-swap')
    void h.offsetWidth
    h.classList.add('theme-swap')
  }
  if (dir) announce(t(dir === 'undo' ? 'nav.undo' : 'nav.redo'))
}

export function undo(): void {
  flushPending()
  if (index > 0) {
    index--
    apply(timeline[index]!, 'undo')
    updateButtons()
  }
}

export function redo(): void {
  if (index < timeline.length - 1) {
    index++
    apply(timeline[index]!, 'redo')
    updateButtons()
  }
}
