// Phase 4 — PNG export with embedded fonts (fixes "字體跑掉").
// A canvas rasterizes the SVG loaded as an isolated <img>, which can't see the
// page's @font-face web fonts, so text fell back to a system font. Here we embed
// base64 @font-face rules for the fonts actually used (local pixel fonts fetched
// same-origin; Google fonts fetched + subsetted via the &text= param so CJK stays
// tiny) into the SVG via render-svg's fontFaceCss option, then rasterize.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { $, dl, showError, svgEl } from './dom'
import { curLook, fontStack, state } from './state'
import { exportOpts } from './io'
import { toast } from './feel'
import { t } from './i18n'

interface FontSrc {
  family: string
  kind: 'local' | 'google'
  url?: string // local ttf path
  google?: string // Google family param (e.g. 'Noto+Sans+TC')
  weights?: string // e.g. '400;700'
}

const FONTS: FontSrc[] = [
  { family: 'Quicksand', kind: 'google', google: 'Quicksand', weights: '400;500;600;700' },
  { family: 'Nunito', kind: 'google', google: 'Nunito', weights: '400;600;700;800' },
  { family: 'Baloo 2', kind: 'google', google: 'Baloo+2', weights: '500;600;700' },
  { family: 'Poppins', kind: 'google', google: 'Poppins', weights: '400;500;600' },
  { family: 'Fredoka', kind: 'google', google: 'Fredoka', weights: '400;500;600' },
  { family: 'Space Mono', kind: 'google', google: 'Space+Mono', weights: '400;700' },
  { family: 'Noto Sans TC', kind: 'google', google: 'Noto+Sans+TC', weights: '400;500;700' },
  { family: 'Cubic 11', kind: 'local', url: 'fonts/Cubic_11.ttf' },
  { family: 'Boutique Bitmap 9x9 Bold', kind: 'local', url: 'fonts/BoutiqueBitmap9x9_Bold.ttf' },
  { family: 'Boutique Bitmap 9x9', kind: 'local', url: 'fonts/BoutiqueBitmap9x9.ttf' },
]

function ab2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Which @font-face families are referenced by the look or any style override. */
function neededFonts(): FontSrc[] {
  const L = curLook()
  const stacks = [fontStack(L.latinFont, L.cjkFont)]
  const so: Record<string, any> = (state.receipt as any).styleOverrides || {}
  for (const id in so) if (so[id]?.fontFamily) stacks.push(so[id].fontFamily)
  const blob = stacks.join(',')
  // Match with surrounding quotes so "Boutique Bitmap 9x9" doesn't match the Bold.
  return FONTS.filter((f) => blob.includes("'" + f.family + "'"))
}

// fetch with a hard timeout — a stalled font request on venue wifi must not hang the export
// (which runs AFTER the ceremony with the button disabled); on abort the caller falls back to
// no-embed, i.e. a still-correct PNG with system-font substitution
async function fetchT(url: string, ms = 4000): Promise<Response> {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { signal: ctl.signal })
  } finally {
    clearTimeout(to)
  }
}

async function localFace(f: FontSrc): Promise<string> {
  const res = await fetchT(f.url!)
  if (!res.ok) throw new Error('font ' + f.url)
  const b64 = ab2b64(await res.arrayBuffer())
  return (
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:400;` +
    `src:url(data:font/ttf;base64,${b64}) format('truetype');}`
  )
}

async function googleFaces(f: FontSrc, text: string): Promise<string> {
  const api =
    `https://fonts.googleapis.com/css2?family=${f.google}:wght@${f.weights}` +
    `&text=${encodeURIComponent(text)}&display=swap`
  const css = await (await fetchT(api)).text()
  // Inline every gstatic url as a data URI. With &text= subsetting the URL is a
  // dynamic /l/font endpoint (no .woff2 extension), so match any https url().
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1])
  let out = css
  for (const u of urls) {
    try {
      const b64 = ab2b64(await (await fetchT(u)).arrayBuffer())
      out = out.split(u).join('data:font/woff2;base64,' + b64)
    } catch {
      /* leave the remote url as a fallback */
    }
  }
  return out
}

/** Build @font-face CSS (base64) for the fonts used by the current receipt. */
export async function buildFontFaceCss(): Promise<string> {
  const needed = neededFonts()
  if (!needed.length) return ''
  const svg = svgEl()
  const text = svg ? [...new Set(svg.textContent || '')].join('') : ''
  const parts: string[] = []
  for (const f of needed) {
    try {
      parts.push(f.kind === 'local' ? await localFace(f) : await googleFaces(f, text || 'ABC'))
    } catch {
      /* skip a font we can't fetch — it falls back, no worse than before */
    }
  }
  return parts.join('\n')
}

/** Rasterize an SVG string to a PNG Blob via an isolated <img> + canvas (2x). */
function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    img.onload = () => {
      try {
        // 2x for crispness, but clamp so a tall receipt can't exceed the browser canvas cap
        // (~4096px/side, ~16.7M px on iOS Safari) and silently produce a blank/null blob
        const W = img.naturalWidth
        const H = img.naturalHeight
        const MAX_SIDE = 4096
        const MAX_AREA = 16e6
        const sc = Math.max(1, Math.min(2, MAX_SIDE / W, MAX_SIDE / H, Math.sqrt(MAX_AREA / (W * H))))
        const cv = document.createElement('canvas')
        cv.width = Math.round(W * sc)
        cv.height = Math.round(H * sc)
        const cx = cv.getContext('2d')!
        cx.scale(sc, sc)
        cx.drawImage(img, 0, 0)
        cv.toBlob((b) => {
          URL.revokeObjectURL(url)
          b ? resolve(b) : reject(new Error('toBlob'))
        }, 'image/png')
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e as Error)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('img'))
    }
    img.src = url
  })
}

/** The clean, finished receipt as a PNG Blob (with embedded fonts). Shared by download + share. */
export async function receiptPngBlob(): Promise<Blob> {
  let css = ''
  try {
    css = await buildFontFaceCss()
  } catch {
    /* fall back to no embedded fonts */
  }
  const svg = renderReceiptToSvg(
    state.receipt as never,
    exportOpts({ fontFaceCss: css, includeXmlDeclaration: true }) as never,
  )
  return svgToPngBlob(svg)
}

export async function downloadPng(): Promise<void> {
  const btn = $('dl-png') as HTMLButtonElement | null
  const label = btn?.textContent ?? ''
  if (btn) {
    btn.textContent = t('btn.downloadPng.busy')
    btn.disabled = true
  }
  try {
    dl('receipt.png', await receiptPngBlob())
    toast(t('toast.png'))
  } catch {
    showError(t('error.pngFailed'))
  } finally {
    if (btn) {
      btn.textContent = label
      btn.disabled = false
    }
  }
}
