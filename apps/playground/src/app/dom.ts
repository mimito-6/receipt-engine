// Thin DOM helpers shared across editor modules: element lookup, error banner,
// file reading, blob download, and SVG↔receipt coordinate conversion.
import { t } from './i18n'

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export function showError(m: string): void {
  const e = $('err')
  e.textContent = m
  e.style.display = 'block'
}
export function clearError(): void {
  $('err').style.display = 'none'
}

/** Read a File as a data URL; warns (non-blocking) when it's large. */
export function readFile(file: File | undefined, cb: (dataUrl: string) => void): void {
  if (file && file.size > 2 * 1024 * 1024) {
    showError(t('error.imageTooLarge'))
  }
  if (!file) return
  const fr = new FileReader()
  fr.onload = () => cb(String(fr.result))
  fr.readAsDataURL(file)
}

/** Trigger a browser download of a Blob. */
export function dl(name: string, blob: Blob): void {
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(u), 800)
}

// ---------------------------------------------------------------------------
// Coordinate helpers — convert between client pixels and receipt (viewBox) units
// ---------------------------------------------------------------------------

export function svgEl(): SVGSVGElement | null {
  return $('svg-host').querySelector('svg')
}
export function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect()
}
/** receipt-units per client-pixel (viewBox width / rendered width). */
export function scaleFactor(): number {
  const s = svgEl()
  return s ? s.viewBox.baseVal.width / rectOf(s).width : 1
}
export function clientToReceipt(cx: number, cy: number): { x: number; y: number } {
  const s = svgEl()
  if (!s) return { x: 0, y: 0 }
  const r = rectOf(s)
  const k = scaleFactor()
  return { x: (cx - r.left) * k, y: (cy - r.top) * k }
}
/** Receipt-unit point -> px relative to #paper (for overlay handles). */
export function receiptToPaper(x: number, y: number): { l: number; t: number } {
  const s = svgEl()
  if (!s) return { l: 0, t: 0 }
  const r = rectOf(s)
  const pr = rectOf($('paper'))
  const k = scaleFactor()
  return { l: r.left - pr.left + x / k, t: r.top - pr.top + y / k }
}
/** Receipt-unit length -> px. */
export function receiptLen(len: number): number {
  return len / scaleFactor()
}
