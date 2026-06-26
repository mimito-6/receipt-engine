// Render pipeline: state.receipt -> validate -> SVG into the canvas.
// The editor mutates `state`; this module is the only place that paints it.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import {
  getTheme,
  mergeTheme,
  type ReceiptTheme,
  type ReceiptThemePalette,
  type ReceiptThemeTypography,
} from '@receipt-engine/themes'
import { safeValidateReceipt } from '@receipt-engine/core'
import { $, clearError, showError } from './dom'
import { curEdges, curLook, curMono, curPad, curWidth, deepClone, fontStack, state } from './state'
import { layoutOverlay } from './overlay'
import { labelFor, refreshInspector } from './inspector'
import { positionEdgeHandles } from './resize'
import { renderOrderPanel } from './reorder'
import { scheduleHistory } from './history'
import { announce } from './feel'
import { t } from './i18n'

/** hex (#rgb or #rrggbb) → rgba() with the given alpha. */
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(f.slice(0, 2), 16)
  const g = parseInt(f.slice(2, 4), 16)
  const b = parseInt(f.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/** Build the active theme: both themes go through mergeTheme so 外觀 works for either. */
export function currentTheme(): ReceiptTheme {
  const L = curLook()
  // Both palette & typography are partial here (only the fields the UI controls);
  // mergeTheme merges them over the theme defaults, so cast to the full shape.
  return mergeTheme(getTheme(state.theme), {
    palette: {
      primary: L.primary,
      accent: L.primary,
      secondary: L.primary,
      background: L.bg,
      surface: L.surface,
      text: L.text,
      // derive muted (metadata: receipt no / cashier / dates) + the card border from the look's own
      // text colour, instead of the theme's hard-coded pinks (mutedText #a4799b / border #ffd6e7)
      // which clashed with every non-pink template
      mutedText: hexToRgba(L.text, 0.55),
      border: hexToRgba(L.text, 0.16),
    } as ReceiptThemePalette,
    typography: { fontFamily: fontStack(L.latinFont, L.cjkFont) } as ReceiptThemeTypography,
    decoration: { showCornerStars: !!L.stars },
  })
}

export function applyScale(): void {
  $('paper').style.maxWidth = state.scale + 'px'
}

/** Common render options shared by the canvas and the exporters. */
export function renderOpts(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const pad = curPad()
  return {
    theme: currentTheme(),
    width: curWidth(),
    padTop: pad.top,
    padBottom: pad.bottom,
    padX: pad.x,
    monochromeImages: curMono(),
    perforatedEdges: curEdges(),
    ...extra,
  }
}

// rAF-coalesced render for high-frequency callers (range sliders, edge-drag) so a fast drag
// paints once per frame instead of running the full validate→render→overlay pipeline per tick
let _raf = 0
let _specT = 0 // debounce timer for the spoken dimension read-out
let _lastDims = '' // last announced W×H, so unchanged renders (typing) don't re-announce
export function scheduleRender(): void {
  if (_raf) return
  _raf = requestAnimationFrame(() => {
    _raf = 0
    render()
  })
}

export function render(): void {
  const check = safeValidateReceipt(state.receipt)
  if (!check.success) {
    showError(t('error.receiptIncomplete') + (check.error?.format() ?? ''))
    layoutOverlay()
    return
  }
  clearError()
  // The overlay owns stickers while editing, so strip them from the painted SVG.
  const forSvg = deepClone(check.data) as Record<string, unknown>
  delete forSvg.stickers
  try {
    $('svg-host').innerHTML = renderReceiptToSvg(forSvg as never, renderOpts({ interactive: true }))
  } catch (e) {
    showError(String((e as Error)?.message || e))
    return
  }
  $('paper').className = state.theme === 'thermal' ? 'thermal' : ''
  // keyboard/SR a11y: make each editable receipt text focusable + labelled (mirrors stickers);
  // Enter/Space on a focused one opens the inspector (see onCanvasKeydown)
  $('svg-host')
    .querySelectorAll('svg [data-re-id]')
    .forEach((el) => {
      el.setAttribute('tabindex', '0')
      el.setAttribute('role', 'button')
      // friendly SR name: "<field> <value>" (e.g. "合計 120") so a bare total isn't read as "120"
      const id = el.getAttribute('data-re-id') || ''
      const txt = (el.textContent || '').trim()
      const lbl = labelFor(id)
      const aria = lbl === id ? txt : (lbl + ' ' + txt).trim()
      if (aria) el.setAttribute('aria-label', aria)
    })
  applyScale()
  layoutOverlay()
  refreshInspector()
  positionEdgeHandles()
  renderOrderPanel()
  // stringifying multi-KB/MB base64 (logo/bg/stickers) every render is pure waste while the JSON
  // panel is collapsed — only write it when the user can actually see it
  const jsonEl = $('json') as HTMLTextAreaElement
  if ((jsonEl.closest('details') as HTMLDetailsElement | null)?.open !== false) {
    jsonEl.value = JSON.stringify(state.receipt, null, 2)
  }
  // live [SPECIMEN №] readout — true export W×H, written into a sibling chip (never into #paper).
  // The chip is aria-hidden (visual only); SR feedback goes through a DEBOUNCED announce so a width
  // drag doesn't flood AT with a read-out per frame.
  const sv = $('svg-host').querySelector('svg') as SVGSVGElement | null
  const cap = document.getElementById('spec-readout')
  if (sv && cap) {
    const vb = sv.viewBox.baseVal
    const dims = `${Math.round(vb.width)} × ${Math.round(vb.height)}`
    cap.textContent = dims
    if (dims !== _lastDims) {
      _lastDims = dims
      window.clearTimeout(_specT)
      _specT = window.setTimeout(() => announce(t('spec.size') + ' ' + dims), 450)
    }
  }
  scheduleHistory()
}
