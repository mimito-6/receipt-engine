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

/**
 * Read a File as a data URL. Raster images (PNG/JPEG/WebP) are DOWNSCALED to a sane max
 * dimension before producing the data URI, so a phone-camera photo can't bloat localStorage
 * (quota) or overflow the PNG-export canvas. Vector/other types pass through (with a soft
 * warning if huge).
 */
const MAX_IMG_DIM = 1600
export function readFile(file: File | undefined, cb: (dataUrl: string) => void): void {
  if (!file) return
  const fr = new FileReader()
  fr.onload = () => {
    const url = String(fr.result)
    if (!/^data:image\/(png|jpe?g|webp|bmp)/i.test(url)) {
      // SVG / GIF / other: small ones pass through (keep the vector / animation); an OVERSIZED one
      // is rasterized to a bounded PNG so it doesn't get embedded in every history snapshot + the
      // autosave blob (a multi-MB animated GIF would blow the history budget on the first edit).
      if (file.size <= 2 * 1024 * 1024) {
        cb(url)
        return
      }
      const im = new Image()
      im.onload = () => {
        const w = im.naturalWidth || MAX_IMG_DIM
        const h = im.naturalHeight || MAX_IMG_DIM
        const s = Math.min(1, MAX_IMG_DIM / Math.max(w, h))
        const cv = document.createElement('canvas')
        cv.width = Math.max(1, Math.round(w * s))
        cv.height = Math.max(1, Math.round(h * s))
        const cx = cv.getContext('2d')
        if (!cx) {
          showError(t('error.imageTooLarge'))
          return
        }
        cx.drawImage(im, 0, 0, cv.width, cv.height)
        try {
          cb(cv.toDataURL('image/png'))
        } catch {
          showError(t('error.imageTooLarge')) // hard-block: don't pass the multi-MB blob through
        }
      }
      im.onerror = () => showError(t('error.imageTooLarge'))
      im.src = url
      return
    }
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (Math.max(w, h) <= MAX_IMG_DIM) {
        cb(url)
        return
      }
      const s = MAX_IMG_DIM / Math.max(w, h)
      const cv = document.createElement('canvas')
      cv.width = Math.round(w * s)
      cv.height = Math.round(h * s)
      const cx = cv.getContext('2d')
      if (!cx) {
        cb(url)
        return
      }
      cx.drawImage(img, 0, 0, cv.width, cv.height)
      try {
        cb(cv.toDataURL(/jpe?g/i.test(url) ? 'image/jpeg' : 'image/png', 0.9))
      } catch {
        cb(url) // tainted (shouldn't happen for a same-origin data URI) — keep the original
      }
    }
    img.onerror = () => cb(url)
    img.src = url
  }
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
