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
import { curLook, curMono, curPad, curWidth, deepClone, fontStack, state } from './state'
import { layoutOverlay } from './overlay'
import { refreshInspector } from './inspector'
import { positionEdgeHandles } from './resize'
import { renderOrderPanel } from './reorder'
import { scheduleHistory } from './history'

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
    ...extra,
  }
}

export function render(): void {
  const check = safeValidateReceipt(state.receipt)
  if (!check.success) {
    showError('資料還沒填完整:\n\n' + (check.error?.format() ?? ''))
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
  applyScale()
  layoutOverlay()
  refreshInspector()
  positionEdgeHandles()
  renderOrderPanel()
  ;($('json') as HTMLTextAreaElement).value = JSON.stringify(state.receipt, null, 2)
  scheduleHistory()
}
