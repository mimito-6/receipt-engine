// Browser font embedding: build base64 @font-face CSS for the fonts a receipt
// actually uses, so a canvas-rasterized SVG (print/share) renders the designed
// typeface instead of a system fallback. Google fonts are fetched subsetted via
// the CSS2 &text= param (so even CJK stays tiny); bundled pixel fonts are fetched
// same-origin from `localBase`. Any font that can't be fetched is skipped.

interface FontSrc {
  family: string
  kind: 'local' | 'google'
  file?: string // local filename under localBase
  google?: string // Google family param, e.g. 'Noto+Sans+TC'
  weights?: string
}

const FONTS: FontSrc[] = [
  { family: 'Quicksand', kind: 'google', google: 'Quicksand', weights: '400;500;600;700' },
  { family: 'Nunito', kind: 'google', google: 'Nunito', weights: '400;600;700;800' },
  { family: 'Baloo 2', kind: 'google', google: 'Baloo+2', weights: '500;600;700' },
  { family: 'Poppins', kind: 'google', google: 'Poppins', weights: '400;500;600' },
  { family: 'Fredoka', kind: 'google', google: 'Fredoka', weights: '400;500;600' },
  { family: 'Space Mono', kind: 'google', google: 'Space+Mono', weights: '400;700' },
  { family: 'Noto Sans TC', kind: 'google', google: 'Noto+Sans+TC', weights: '400;500;700' },
  { family: 'Cubic 11', kind: 'local', file: 'Cubic_11.ttf' },
  { family: 'Boutique Bitmap 9x9 Bold', kind: 'local', file: 'BoutiqueBitmap9x9_Bold.ttf' },
  { family: 'Boutique Bitmap 9x9', kind: 'local', file: 'BoutiqueBitmap9x9.ttf' },
]

function ab2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

/** Unique glyphs from an SVG string (tags stripped) — what to subset Google fonts to. */
function glyphsOf(svgOrText: string): string {
  const text = svgOrText.replace(/<[^>]+>/g, ' ')
  return [...new Set(text)].join('')
}

async function localFace(f: FontSrc, base: string): Promise<string> {
  const url = base.replace(/\/?$/, '/') + f.file
  const res = await fetch(url)
  if (!res.ok) throw new Error('font ' + url)
  const b64 = ab2b64(await res.arrayBuffer())
  return (
    `@font-face{font-family:'${f.family}';font-style:normal;font-weight:400;` +
    `src:url(data:font/ttf;base64,${b64}) format('truetype');}`
  )
}

async function googleFaces(f: FontSrc, text: string): Promise<string> {
  const api =
    `https://fonts.googleapis.com/css2?family=${f.google}:wght@${f.weights}` +
    `&text=${encodeURIComponent(text || 'ABC')}&display=swap`
  let css = await (await fetch(api)).text()
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]!)
  for (const u of urls) {
    try {
      const b64 = ab2b64(await (await fetch(u)).arrayBuffer())
      css = css.split(u).join('data:font/woff2;base64,' + b64)
    } catch {
      /* leave the remote url as a fallback */
    }
  }
  return css
}

export interface FontEmbedOptions {
  /** Base URL for bundled pixel fonts (Cubic/Boutique). Default 'fonts/'. */
  localBase?: string
  /** Disable Google embedding (e.g. known-offline). Default false. */
  noGoogle?: boolean
}

/**
 * Build @font-face CSS (base64) for every registry font whose family appears in
 * `stacks` (quoted font-family strings). `text` (or an SVG string) drives Google
 * subsetting. Returns '' if nothing matches or all fetches fail — callers pass the
 * result to renderReceiptToSvg's `fontFaceCss`.
 */
export async function buildFontFaceCss(
  stacks: string[],
  text = '',
  opts: FontEmbedOptions = {},
): Promise<string> {
  const blob = (stacks || []).join(',')
  // Match with surrounding quotes so "Boutique Bitmap 9x9" ≠ the Bold variant.
  const needed = FONTS.filter((f) => blob.includes("'" + f.family + "'"))
  if (!needed.length) return ''
  const glyphs = glyphsOf(text)
  const base = opts.localBase ?? 'fonts/'
  const parts: string[] = []
  for (const f of needed) {
    try {
      if (f.kind === 'local') parts.push(await localFace(f, base))
      else if (!opts.noGoogle) parts.push(await googleFaces(f, glyphs))
    } catch {
      /* skip a font we can't fetch — it falls back, no worse than before */
    }
  }
  return parts.join('\n')
}
