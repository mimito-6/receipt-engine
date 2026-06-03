// Phase 1 — direct-manipulation text editing.
// Click any text on the receipt -> a selection box + a contextual inspector that
// writes per-element styles into state.receipt.styleOverrides (keyed by the
// element's data-re-id). Overrides travel with the receipt (JSON / config / export).
import { $ } from './dom'
import { render } from './render'
import { FONT_PRESETS, state } from './state'
import { renderStickerList } from './form'
import { clearFrame } from './overlay'

const PAD = 4 // selection box padding (screen px)

let panel: HTMLDivElement | null = null
let box: HTMLDivElement | null = null

// ---------------------------------------------------------------------------
// styleOverrides helpers
// ---------------------------------------------------------------------------

function overrides(): Record<string, any> {
  const r: any = state.receipt
  if (!r.styleOverrides) r.styleOverrides = {}
  return r.styleOverrides
}
function overrideFor(id: string): any {
  return (state.receipt as any).styleOverrides?.[id]
}
function setOverride(id: string, patch: Record<string, unknown>): void {
  const all = overrides()
  const cur = { ...(all[id] || {}), ...patch }
  // Drop keys set back to undefined/empty so the override stays minimal.
  for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === '') delete cur[k]
  if (Object.keys(cur).length) all[id] = cur
  else delete all[id]
  if (!Object.keys(all).length) delete (state.receipt as any).styleOverrides
  render()
  refreshInspector()
}
function resetOverride(id: string): void {
  const all = (state.receipt as any).styleOverrides
  if (all) {
    delete all[id]
    if (!Object.keys(all).length) delete (state.receipt as any).styleOverrides
  }
  render()
  // re-sync controls to the element's now-default look
  const el = findEl(id)
  if (el) syncControls(id, el)
  refreshInspector()
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

function build(): void {
  if (panel) return
  box = document.createElement('div')
  box.id = 're-sel-box'
  box.hidden = true
  $('paper').appendChild(box)

  panel = document.createElement('div')
  panel.id = 'inspector'
  panel.className = 'inspector'
  panel.hidden = true
  panel.innerHTML =
    '<div class="insp-head"><span class="insp-title">文字樣式</span>' +
    '<button class="insp-x" id="insp-close" title="關閉">×</button></div>' +
    '<div class="insp-target" id="insp-target"></div>' +
    '<label class="insp-field">字體' +
    '<select id="insp-font"><option value="">(沿用整體)</option>' +
    FONT_PRESETS.map((f) => `<option value="${f.id}">${f.label}</option>`).join('') +
    '</select></label>' +
    '<div class="insp-grid">' +
    '<label class="insp-field">顏色<input type="color" id="insp-color" /></label>' +
    '<label class="insp-field">大小 <em id="insp-size-val"></em>' +
    '<input type="range" id="insp-size" min="8" max="64" step="1" /></label>' +
    '</div>' +
    '<div class="insp-field">粗細<div class="insp-seg" id="insp-weight">' +
    '<button type="button" data-w="400">一般</button>' +
    '<button type="button" data-w="600">中</button>' +
    '<button type="button" data-w="700">粗</button></div></div>' +
    '<button type="button" class="insp-reset" id="insp-reset">↺ 還原此元素樣式</button>'
  document.body.appendChild(panel)

  // wiring
  const fontSel = $('insp-font') as HTMLSelectElement
  const colorInp = $('insp-color') as HTMLInputElement
  const sizeInp = $('insp-size') as HTMLInputElement
  ;($('insp-close') as HTMLButtonElement).onclick = () => clearSelection()
  fontSel.onchange = () => {
    const id = currentId()
    if (!id) return
    const preset = FONT_PRESETS.find((f) => f.id === fontSel.value)
    setOverride(id, { fontFamily: preset ? preset.stack : undefined })
  }
  colorInp.oninput = () => {
    const id = currentId()
    if (id) setOverride(id, { color: colorInp.value })
  }
  sizeInp.oninput = () => {
    const id = currentId()
    ;($('insp-size-val') as HTMLElement).textContent = sizeInp.value + 'px'
    if (id) setOverride(id, { size: Number(sizeInp.value) })
  }
  $('insp-weight')
    .querySelectorAll('button')
    .forEach((b) => {
      ;(b as HTMLButtonElement).onclick = () => {
        const id = currentId()
        if (!id) return
        setWeightActive(Number((b as HTMLElement).dataset.w))
        setOverride(id, { weight: Number((b as HTMLElement).dataset.w) })
      }
    })
  ;($('insp-reset') as HTMLButtonElement).onclick = () => {
    const id = currentId()
    if (id) resetOverride(id)
  }
}

function currentId(): string | null {
  return state.selection && state.selection.kind === 'text' ? state.selection.id : null
}
function setWeightActive(w: number): void {
  $('insp-weight')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', Number((b as HTMLElement).dataset.w) === w))
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function findEl(id: string): SVGGraphicsElement | null {
  return $('svg-host').querySelector(`[data-re-id="${CSS.escape(id)}"]`)
}

/** Friendly label for what's selected. */
function labelFor(id: string): string {
  const map: Record<string, string> = {
    'merchant.name': '店名',
    'merchant.subtitle': '標語',
    'totals.subtotal': '小計',
    'totals.discount': '折扣',
    'totals.tax': '稅',
    'totals.service': '服務費',
    'totals.total': '總計',
    'qr.label': 'QR 標題',
    'qr.caption': 'QR 說明',
    'message.title': '訊息標題',
    'message.body': '訊息內文',
    'message.footer': '訊息頁尾',
  }
  if (map[id]) return map[id]
  const im = id.match(/^items\.(\d+)\.(name|price)$/)
  if (im) return `品項 ${Number(im[1]) + 1} · ${im[2] === 'name' ? '名稱' : '價格'}`
  return id
}

function rgbToHex(v: string): string {
  if (!v) return '#000000'
  if (v[0] === '#') {
    if (v.length === 4) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
    return v
  }
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (!m) return '#000000'
  const [r, g, b] = m[1].split(',').map((s) => parseInt(s.trim(), 10))
  const h = (x: number): string => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/** Populate the inspector controls from the override (or the live element). */
function syncControls(id: string, el: SVGGraphicsElement): void {
  const o = overrideFor(id) || {}
  const cs = getComputedStyle(el as unknown as Element)
  ;($('insp-target') as HTMLElement).textContent = labelFor(id)
  const fontSel = $('insp-font') as HTMLSelectElement
  const preset = o.fontFamily ? FONT_PRESETS.find((f) => f.stack === o.fontFamily) : null
  fontSel.value = preset ? preset.id : ''
  const size = o.size != null ? o.size : Math.round(parseFloat(cs.fontSize) || 15)
  ;($('insp-size') as HTMLInputElement).value = String(size)
  ;($('insp-size-val') as HTMLElement).textContent = size + 'px'
  const color = o.color || rgbToHex(el.getAttribute('fill') || cs.fill || '#000')
  ;($('insp-color') as HTMLInputElement).value = rgbToHex(color)
  let w = o.weight
  if (w == null) {
    const fw = cs.fontWeight
    w = fw === 'bold' ? 700 : fw === 'normal' ? 400 : Number(fw) || 400
  }
  setWeightActive(Number(w))
}

export function selectText(id: string): void {
  build()
  const el = findEl(id)
  if (!el) return
  state.selection = { kind: 'text', id }
  state.sel = -1 // drop any sticker selection
  clearFrame()
  document.querySelectorAll('.sticker-handle.sel').forEach((h) => h.classList.remove('sel'))
  renderStickerList()
  syncControls(id, el)
  panel!.hidden = false
  positionUi(el)
}

export function clearSelection(): void {
  if (state.selection && state.selection.kind === 'text') state.selection = null
  if (panel) panel.hidden = true
  if (box) box.hidden = true
}

/** After a re-render the SVG is rebuilt — re-find the element and reposition. */
export function refreshInspector(): void {
  const id = currentId()
  if (!id) {
    if (box) box.hidden = true
    return
  }
  const el = findEl(id)
  if (!el) {
    clearSelection()
    return
  }
  positionUi(el)
}

function positionUi(el: SVGGraphicsElement): void {
  if (!box || !panel) return
  const rect = el.getBoundingClientRect()
  const paper = $('paper').getBoundingClientRect()
  box.hidden = false
  box.style.left = rect.left - paper.left - PAD + 'px'
  box.style.top = rect.top - paper.top - PAD + 'px'
  box.style.width = rect.width + PAD * 2 + 'px'
  box.style.height = rect.height + PAD * 2 + 'px'

  const sheet = window.innerWidth < 900
  panel.classList.toggle('as-sheet', sheet)
  if (sheet) {
    panel.style.left = ''
    panel.style.top = ''
  } else {
    const pw = panel.offsetWidth || 280
    const ph = panel.offsetHeight || 200
    let left = rect.right + 12
    if (left + pw > window.innerWidth - 8) left = Math.max(8, rect.left - pw - 12)
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - ph - 8))
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'
  }
}
