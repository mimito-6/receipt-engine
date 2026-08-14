// BLE thermal printing for the design currently open in the editor.
//
// The point of this panel (versus the standalone print-test page) is that it prints
// WHAT YOU DESIGNED — the live receipt, look, padding, stickers and block order — with its
// composition intact. The design's SVG is rasterized straight to the head width, which keeps
// the exact proportions AND is natively 576 dots (vector re-render, not a bitmap upscale).
import { PAPER_58, PAPER_80, type PaperProfile } from '@receipt-engine/core'
import { renderReceiptToSvg, type RenderLayer } from '@receipt-engine/render-svg'
import { mergeTheme } from '@receipt-engine/themes'
import { toBlackMap, type SpotShape } from '@receipt-engine/bitmap'
import { buildFontFaceCss } from './pngExport'
import {
  BleTransport,
  getPrinterProfile,
  getTransmissionMode,
  receiptLayersToEscposWithMetadata,
  svgToImageData,
  type PrinterProfile,
  type TransmissionModeName,
} from '@receipt-engine/connect'
import { $ } from './dom'
import { currentTheme, renderOpts } from './render'
import { state } from './state'
import { toast } from './feel'
import { t } from './i18n'

let transport: BleTransport | null = null
let busy = false

const sel = (id: string): HTMLSelectElement => $(id) as HTMLSelectElement
const checked = (id: string): boolean => ($(id) as HTMLInputElement).checked

function setStatus(text: string, kind: 'idle' | 'busy' | 'ok' | 'err'): void {
  const el = $('ble-status')
  el.textContent = text
  el.dataset.kind = kind
}

function paperProfile(): PaperProfile {
  return sel('ble-paper').value === '58mm' ? PAPER_58 : PAPER_80
}

function printerProfile(): PrinterProfile {
  const p = getPrinterProfile(sel('ble-printer').value)
  if (!p) throw new Error('unknown printer profile')
  return p
}

function showDiagnostics(extra: Record<string, string | number> = {}): void {
  const d = transport?.getDiagnostics()
  const rows: Array<[string, string | number | undefined]> = [
    ['狀態 State', d?.state ?? 'disconnected'],
    ['裝置 Device', d?.deviceName],
    ['Service UUID', d?.serviceUuid],
    ['Characteristic UUID', d?.characteristicUuid],
    ['Write mode', d?.writeMode],
    ['Chunk / delay', d ? `${d.chunkSize} bytes / ${d.delayMs} ms` : undefined],
    ['已送 Bytes', d ? `${d.bytesSent} / ${d.totalBytes}` : undefined],
    ['Chunk count', d?.chunkCount],
    ...(Object.entries(extra) as Array<[string, string | number]>),
    ['錯誤 Error', d?.lastError],
  ]
  // The device name and the error text come from the peripheral and from the browser — not
  // from us — so they are escaped. A printer that advertises itself with markup in its name
  // would otherwise inject it into the page.
  const esc = (v: string): string =>
    v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  $('ble-diag').innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="ble-row"><span>${esc(k)}</span><span>${
          v === undefined || v === '' ? '—' : esc(String(v))
        }</span></div>`,
    )
    .join('')
}

/**
 * Render the CURRENT editor design EXACTLY as designed — its own width, padding and
 * block flow, untouched.
 *
 * It is deliberately NOT re-laid-out at the printer's dot width. Re-flowing at 576
 * changed the composition (different wrapping, different proportions) and, worse, moved
 * every sticker: sticker x/y are absolute coordinates in the design's own canvas, so
 * narrowing the canvas slides them across the receipt.
 *
 * Instead the SVG is rasterized to the head width downstream. That is a VECTOR
 * rasterization — the browser re-renders the text at the final resolution — not the
 * bitmap upscale we must avoid, so the print keeps the design's exact proportions while
 * still being natively 576 dots wide.
 */
let printFontCss: string | null = null

/**
 * Subsetted @font-face CSS for the print render, fetched once per design.
 *
 * The raster path loads the SVG as an isolated document from a blob: URL, so it cannot see
 * the page's own @font-face rules — a bare `font-family` name resolves to whatever the
 * machine happens to have, which for the bundled pixel faces is nothing at all. Both other
 * export paths already embed; this one printed in a system fallback while claiming to print
 * what you designed. Best-effort: a failed fetch costs the typeface, never the print.
 */
async function ensurePrintFontCss(): Promise<string> {
  if (printFontCss !== null) return printFontCss
  try {
    printFontCss = await buildFontFaceCss()
  } catch {
    printFontCss = ''
  }
  return printFontCss
}

function buildPrintSvg(_paper: PaperProfile, layers?: RenderLayer[]): string {
  const extra: Record<string, unknown> = {
    ...(layers ? { layers } : {}),
    // Embed the design's own faces; without this the print is a different typeface entirely.
    ...(printFontCss ? { fontFaceCss: printFontCss } : {}),
    // Thermal paper is already white and every dot costs ink and battery, so the page
    // background never prints.
    transparentBackground: true,
    monochromeImages: true,
    backgroundInkBoost: bgDensity().inkBoost,
    // The design's outer margin is the desk the card sits on. There is no desk on a roll —
    // printing it just gives away 7% of the paper width and shrinks the type to match.
    cropToCard: true,
    // Cropped to the card, the outline is no longer an edge against anything — just two lines
    // down the paper. Worse, it inks every single row, so nothing can be elided as blank.
    hideCardBorder: true,
  }
  // "白底黑字" forces a printable palette but KEEPS the design's own fonts and spacing.
  // Swapping in the whole thermal theme also swapped its tighter section/row spacing, which
  // re-flowed the layout so the print no longer matched what the user designed.
  if (checked('ble-mono')) {
    const base = currentTheme()
    extra.theme = mergeTheme(base, {
      palette: {
        ...base.palette,
        background: '#ffffff',
        surface: '#ffffff',
        text: '#000000',
        primary: '#000000',
        secondary: '#000000',
        accent: '#000000',
        mutedText: '#555555',
        border: '#999999',
      },
    } as never)
  }
  return renderReceiptToSvg(printDoc() as never, renderOpts(extra) as never)
}

/**
 * One 0-100% artwork density control, split across the two levers that actually move ink.
 *
 * A background at 30% opacity reads as a subtle wash on screen, but SVG opacity blends it
 * with the white card, so the luminance reaching the 1-bpp conversion is ~240 and error
 * diffusion renders it as ~6% dots: effectively nothing. Raising opacity fixes that — but
 * only until it clamps at 1, after which the artwork's own grey is the ceiling and any
 * further travel on the slider does nothing. A control with a dead half is the bug this is
 * fixing, so past that point the second lever takes over and darkens the artwork itself.
 *
 * 0%   design's own opacity, untouched
 * 50%  fully opaque, original tones
 * 100% fully opaque and driven close to solid black
 */
const INK_BOOST_MAX = 4

/** Assets of the live design, or undefined — the panel wires up before the editor boots. */
function bgAssets(): Record<string, unknown> | undefined {
  const doc = state.receipt as unknown as { assets?: Record<string, unknown> } | null | undefined
  return doc?.assets
}

/** The design's own background opacity, floored so it can be used as a ratio. */
function baseBgOpacity(): number {
  const a = bgAssets()
  const v = a && typeof a.backgroundOpacity === 'number' ? a.backgroundOpacity : 1
  return Math.min(1, Math.max(0.02, v))
}

/**
 * One 0-100% artwork density control, expressed as a single total ink multiplier.
 *
 * Ink on paper is strictly multiplicative here: coverage tracks opacity x boost x the
 * artwork's own ink, because error diffusion conserves tone and the band clamps only gate
 * which pixels dither at all. So both levers are the same knob, and splitting the slider at
 * a fixed midpoint would put a kink in it — worse, a design already at full opacity would
 * have a dead first half, which is the exact bug being fixed.
 *
 * A geometric ramp avoids both: T = base * (MAX/base)^d passes through the design's own
 * opacity at 0 and MAX at 100 whatever the starting point, so the whole travel always does
 * something. Opacity absorbs it up to 1 and the ink boost carries on from there.
 */
function bgDensity(): { opacity: number; inkBoost: number } {
  const d = Math.min(1, Math.max(0, (Number(($('ble-bgdensity') as HTMLInputElement).value) || 0) / 100))
  const base = baseBgOpacity()
  const total = base * Math.pow(INK_BOOST_MAX / base, d)
  return { opacity: Math.min(1, total), inkBoost: Math.max(1, total) }
}

/** The design document as it should print: same content, artwork lifted out of the wash. */
function printDoc(): unknown {
  const doc = state.receipt as unknown as { assets?: Record<string, unknown> }
  const assets = bgAssets()
  if (!assets || !assets.backgroundImage) return doc
  const opacity = bgDensity().opacity
  if (opacity === assets.backgroundOpacity) return doc
  return { ...doc, assets: { ...assets, backgroundOpacity: opacity } }
}

/**
 * 1-bpp conversion settings. Receipts are type, not photographs: error diffusion turns
 * solid glyphs into grey stipple, so a hard threshold is the default and dithering is
 * opt-in for designs carrying photos or gradients.
 */
type BitmapOpts = {
  dither: 'none' | 'floyd-steinberg' | 'hybrid' | 'halftone'
  threshold: number
  inkFloor: number
  paperCeil: number
  spot?: SpotShape
  cellSize?: number
}

/**
 * The three kinds of content on a receipt, each converted to 1-bit on its own terms.
 *
 * After rasterization a pixel carries no idea what drew it, so a single conversion has to
 * treat a letter and a background sketch identically — which is why screening the artwork
 * used to speckle the type's surroundings and make the whole sheet look misprinted. Rendering
 * these separately is the only place the distinction still exists.
 */
const PRINT_LAYERS: Array<{ layers: RenderLayer[]; opts: () => BitmapOpts }> = [
  { layers: ['card', 'content', 'decorations'], opts: () => bitmapOpts('ble-ink-text', 'ble-dotsize-text', 'ble-threshold') },
  { layers: ['logo'], opts: () => bitmapOpts('ble-ink-logo', 'ble-dotsize-logo', 'ble-threshold-logo') },
  { layers: ['artwork'], opts: () => bitmapOpts('ble-ink', 'ble-dotsize', 'ble-threshold-bg') },
  { layers: ['stickers', 'images'], opts: () => bitmapOpts('ble-ink-stickers', 'ble-dotsize-st', 'ble-threshold-st') },
]

function bitmapOpts(selectId: string, grainId: string, thresholdId: string): BitmapOpts {
  const threshold = Number(($(thresholdId) as HTMLInputElement).value) || 145
  // Pinned, not exposed: 255 is bare paper, so this clamp has almost no usable travel and
  // only decides whether faint tone prints AT ALL — never how strongly. Density is set in
  // the vector domain by printDoc(), where the control has real range.
  const paperCeil = 250
  const [mode, spot] = ($(selectId) as HTMLSelectElement).value.split(':')
  // In hybrid and halftone the threshold names the solid-ink floor: everything darker prints
  // solid, so the slider reads as glyph weight rather than as a global on/off point.
  const base = { threshold, inkFloor: threshold, paperCeil }
  if (mode !== 'halftone') {
    return { ...base, dither: mode as 'none' | 'floyd-steinberg' | 'hybrid' }
  }
  // Cell size is a look, so it belongs to whoever is designing the receipt rather than being
  // decided here. Bigger cells make the shape unmistakable and the texture coarse; smaller
  // ones reproduce tone more finely and eventually stop reading as a shape at all.
  const shape = (spot ?? 'round') as SpotShape
  const cellSize = Number(($(grainId) as HTMLInputElement).value) || 12
  return { ...base, dither: 'halftone', spot: shape, cellSize }
}

/**
 * Blank paper advanced after the image. Defaults to 20mm rather than the library's neutral
 * 12mm: this printer has no cutter, so the trailing edge has to clear the tear bar by hand.
 */
function feedMm(): number {
  return Number(($('ble-feed') as HTMLInputElement).value) || 0
}

// Rasterizing the SVG is the slow step; thresholding the pixels is not. Cache by the SVG
// itself so dragging the threshold re-thresholds cached pixels, while a density change (which
// alters the SVG) correctly invalidates and re-renders.
let previewCache: {
  key: string
  width: number
  height: number
  layers: Uint8ClampedArray[]
} | null = null
let previewTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Draw what will actually come out of the printer: the same render, the same rasterization to
 * the head width, the same 1-bit conversion. Not an approximation of the print — the print.
 * On a medium with no grey, a colour preview cannot tell you whether type will hold together
 * or artwork will survive, and those are exactly the two things these sliders decide.
 */
async function drawPreview(): Promise<void> {
  const canvas = $('ble-preview') as HTMLCanvasElement
  const cx = canvas.getContext('2d')
  if (!cx) return
  await ensurePrintFontCss()
  const paper = paperProfile()
  // The preview must be built exactly as the print is — layer by layer, each converted on its
  // own terms — or it shows something the printer will never produce.
  const svgs = PRINT_LAYERS.map((l) => buildPrintSvg(paper, l.layers))
  const key = `${paper.printableWidthDots}
${svgs.join(' ')}`
  if (!previewCache || previewCache.key !== key) {
    const imgs = []
    for (const svg of svgs) imgs.push(await svgToImageData(svg, { width: paper.printableWidthDots }))
    // The print builder rejects mismatched layers; the preview used to take the first layer's
    // dimensions for all of them and composite anyway, which silently drew the others at the
    // wrong offset — the misalignment showed up as doubled artwork rather than as an error.
    const odd = imgs.find((i) => i.width !== imgs[0]!.width || i.height !== imgs[0]!.height)
    if (odd) {
      throw new Error(
        `layer geometry differs: ${imgs[0]!.width}x${imgs[0]!.height} vs ${odd.width}x${odd.height}`,
      )
    }
    previewCache = { key, width: imgs[0]!.width, height: imgs[0]!.height, layers: imgs.map((i) => i.data) }
  }
  const { width, height, layers: layerData } = previewCache
  const black = new Uint8Array(width * height)
  layerData.forEach((data, i) => {
    const m = toBlackMap(data, width, height, PRINT_LAYERS[i]!.opts())
    for (let k = 0; k < black.length; k++) if (m[k]) black[k] = 1
  })
  const out = cx.createImageData(width, height)
  for (let i = 0; i < black.length; i++) {
    const v = black[i] ? 0 : 255
    const o = i * 4
    out.data[o] = v
    out.data[o + 1] = v
    out.data[o + 2] = v
    out.data[o + 3] = 255
  }
  canvas.width = width
  canvas.height = height
  cx.putImageData(out, 0, 0)
}

/** Coalesce drags: one render per pause, not one per pixel of slider travel. */
function schedulePreview(): void {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    void drawPreview().catch(() => {
      // A preview that fails must never break printing — but it must not leave the last
      // good image on screen either, or it silently misrepresents what will be printed.
      const canvas = $('ble-preview') as HTMLCanvasElement
      const cx = canvas.getContext('2d')
      if (!cx) return
      canvas.width = 8
      canvas.height = 8
      cx.clearRect(0, 0, 8, 8)
      previewCache = null
    })
  }, 220)
}

/** The print settings, for the saved config file. */
export function getPrintSettings(): Record<string, unknown> {
  return {
    printer: sel('ble-printer').value,
    paper: sel('ble-paper').value,
    mode: sel('ble-mode').value,
    // Every group, by id, so adding one later does not silently stop being saved.
    layers: Object.fromEntries(
      ['ble-ink-text', 'ble-threshold', 'ble-dotsize-text', 'ble-ink-logo', 'ble-threshold-logo', 'ble-dotsize-logo', 'ble-ink', 'ble-threshold-bg', 'ble-dotsize', 'ble-ink-stickers', 'ble-threshold-st', 'ble-dotsize-st', 'ble-bgdensity'].map((id) => [id, ($(id) as HTMLInputElement | HTMLSelectElement).value]),
    ),
    threshold: Number(($('ble-threshold') as HTMLInputElement).value),
    bgDensity: Number(($('ble-bgdensity') as HTMLInputElement).value),
    feedMm: Number(($('ble-feed') as HTMLInputElement).value),
    mono: checked('ble-mono'),
    requireAck: checked('ble-ack'),
  }
}

/** Restore print settings from a config file, ignoring anything unrecognised. */
export function applyPrintSettings(cfg: unknown): void {
  const p = cfg as Record<string, unknown> | null | undefined
  if (!p) return
  const setSel = (id: string, v: unknown): void => {
    if (typeof v !== 'string') return
    const el = sel(id)
    // A config written on another printer may name an option this build no longer offers.
    if ([...el.options].some((o) => o.value === v && !o.disabled)) el.value = v
  }
  const setNum = (id: string, v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) ($(id) as HTMLInputElement).value = String(v)
  }
  const setChk = (id: string, v: unknown): void => {
    if (typeof v === 'boolean') ($(id) as HTMLInputElement).checked = v
  }
  setSel('ble-printer', p.printer)
  setSel('ble-paper', p.paper)
  setSel('ble-mode', p.mode)
  const saved = (p.layers ?? {}) as Record<string, string>
  for (const [id, v] of Object.entries(saved)) {
    const el = $(id) as HTMLInputElement | HTMLSelectElement | null
    if (!el) continue
    if (el instanceof HTMLSelectElement) setSel(id, v)
    else setNum(id, Number(v))
  }
  setNum('ble-threshold', p.threshold)
  setNum('ble-bgdensity', p.bgDensity)
  setNum('ble-feed', p.feedMm)
  setChk('ble-mono', p.mono)
  setChk('ble-ack', p.requireAck)
  refreshPrintPanel()
}

/** Re-sync the panel's derived UI (readouts, enablement, preview) after any external change. */
export function refreshPrintPanel(): void {
  for (const [id, out] of [
    ['ble-threshold', 'ble-threshold-v'],
    ['ble-threshold-logo', 'ble-threshold-logo-v'],
    ['ble-threshold-bg', 'ble-threshold-bg-v'],
    ['ble-threshold-st', 'ble-threshold-st-v'],
    ['ble-dotsize-text', 'ble-dotsize-text-v'],
    ['ble-dotsize-logo', 'ble-dotsize-logo-v'],
    ['ble-dotsize', 'ble-dotsize-v'],
    ['ble-dotsize-st', 'ble-dotsize-st-v'],
    ['ble-bgdensity', 'ble-bgdensity-v'],
    ['ble-feed', 'ble-feed-v'],
  ] as const) {
    $(out).textContent = ($(id) as HTMLInputElement).value
  }
  syncLiveControls?.()
  schedulePreview()
}

let syncLiveControls: (() => void) | undefined

function ensureTransport(): BleTransport {
  if (!transport) {
    transport = new BleTransport(printerProfile())
    transport.onStateChange = () => showDiagnostics()
  }
  return transport
}

/**
 * A GATT failure is only actionable if the message says what to change. Chrome reports both
 * "packet exceeded the negotiated MTU" and "the module's buffer overflowed" as the same
 * opaque string, and the two want opposite responses — smaller packet vs slower pacing — so
 * point at the rung that distinguishes them instead of leaving the user to guess.
 */
/** Translate the library's own English failures where we recognise them. */
function localizeError(msg: string): string {
  if (/Web Bluetooth is not available/i.test(msg)) return t('ble.unsupported')
  if (/No writable print characteristic/i.test(msg)) return t('ble.noCharacteristic')
  if (/timed out after/i.test(msg)) return t('ble.writeTimeout')
  return msg
}

function nextStepHint(msg: string): string {
  if (!/GATT operation failed|not supported|longer than/i.test(msg)) return ''
  const modes = sel('ble-mode')
  const size = getTransmissionMode(modes.value as TransmissionModeName).chunkSize
  const slower = [...modes.options].filter(
    (o) => !o.disabled && getTransmissionMode(o.value as TransmissionModeName).chunkSize < size,
  )
  // Name a rung that is actually in the list. The previous text pointed at options removed
  // when the list was cut to three, so following it was impossible.
  if (!slower.length) return t('ble.hintSlowest')
  return ` — ${size}B${t('ble.hintDropTo')}「${slower[0]!.textContent!.trim()}」`
}

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    // Silently dropping the click was indistinguishable from "the app is broken".
    setStatus(t('ble.busy'), 'busy')
    return
  }
  busy = true
  try {
    await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`${label} ${t('ble.failed')}: ${localizeError(msg)}${nextStepHint(msg)}`, 'err')
    toast(`${label} 失敗`)
    showDiagnostics()
  } finally {
    busy = false
  }
}

async function connect(): Promise<void> {
  await guard(t('ble.actConnect'), async () => {
    const tr = ensureTransport()
    setStatus(t('ble.connecting'), 'busy')
    await tr.connect()
    setStatus(t('ble.connected') + (tr.name ?? t('ble.thePrinter')), 'ok')
    showDiagnostics()
  })
}

function disconnect(): void {
  transport?.disconnect()
  transport = null
  // Also clear the in-flight flag: "中斷" doubles as the escape hatch when a job has hung,
  // otherwise the panel stays permanently unresponsive with no way back.
  busy = false
  setStatus(t('ble.disconnected'), 'idle')
  showDiagnostics()
}

/** Render → raster → ESC/POS → BLE for the live design. */
async function printCurrent(): Promise<void> {
  await guard(t('ble.actPrint'), async () => {
    await ensurePrintFontCss()
    const paper = paperProfile()
    const printer = printerProfile()
    const { escposBytes, metadata } = await receiptLayersToEscposWithMetadata(
      PRINT_LAYERS.map((l) => ({ svg: buildPrintSvg(paper, l.layers), bitmap: l.opts() })),
      { printer, dots: paper.printableWidthDots, job: { feedAfterPrintMm: feedMm() } },
    )
    const stats = {
      '版面寬 Width (dots)': metadata.widthDots,
      '版面高 Height (dots)': metadata.heightDots,
      'Bytes / row': metadata.bytesPerRow,
      'ESC/POS bytes': escposBytes.length,
      '預估長度 Length (mm)': metadata.estimatedLengthMm,
      '一捲 20m 可印': metadata.estimatedReceiptsPerRoll,
    }
    setStatus(`${t('ble.printing')} ${escposBytes.length} bytes`, 'busy')
    showDiagnostics(stats)
    const tr = ensureTransport()
    // Repaint at most ~10×/s: refreshing on every chunk meant thousands of innerHTML
    // rebuilds mid-transfer, which starved the very stream we were trying to keep fed.
    let lastPaint = 0
    await tr.write(escposBytes, {
      mode: sel('ble-mode').value as TransmissionModeName,
      requireAck: checked('ble-ack'),
      onProgress: (sent, total) => {
        const now = Date.now()
        if (now - lastPaint < 100 && sent < total) return
        lastPaint = now
        setStatus(`${t('ble.printing')} ${sent} / ${total} bytes`, 'busy')
        showDiagnostics(stats)
      },
    })
    setStatus(`${t('ble.sent')} ${escposBytes.length} bytes (${metadata.widthDots} dots)`, 'ok')
    toast('已送到印表機')
    showDiagnostics(stats)
  })
}

/**
 * Smallest possible proof that the write channel reaches the printer's parser: init,
 * a few lines of plain ASCII, then feed. ~60 bytes, no raster, no fonts, no images.
 *
 * If this prints, the BLE path is sound and any failure is in the image data. If it
 * does NOT print, the bytes are not reaching the printer at all — a different problem
 * (wrong characteristic, dropped writes, printer asleep) and no amount of raster
 * tweaking will help.
 */
function selfTestBytes(): Uint8Array {
  const ESC = 0x1b
  const text = 'receipt-engine\nBLE SELF TEST OK\n1234567890\n'
  const out: number[] = [ESC, 0x40] // ESC @  initialize
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff)
  out.push(ESC, 0x64, 4) // ESC d 4  feed 4 lines
  return Uint8Array.from(out)
}

async function selfTest(): Promise<void> {
  await guard(t('ble.actSelfTest'), async () => {
    const bytes = selfTestBytes()
    const tr = ensureTransport()
    setStatus(`${t('ble.selfTestSending')} — ${bytes.length} bytes`, 'busy')
    await tr.write(bytes, {
      mode: sel('ble-mode').value as TransmissionModeName,
      requireAck: checked('ble-ack'),
    })
    setStatus(`${t('ble.selfTestDone')} (${bytes.length} bytes)`, 'ok')
    showDiagnostics({ '自我測試 bytes': bytes.length })
  })
}

/**
 * Share of dots that will actually be burned, as a percentage. Thermal output is binary, so
 * this is the only honest read on what the threshold/dither controls just did: near 0% means
 * faint artwork is being dropped entirely, and a high number means the sheet will come out
 * muddy and slow. Header bytes are counted too — a few dozen out of tens of thousands.
 */
function inkCoverage(bytes: Uint8Array, widthDots: number, heightDots: number): string {
  let bits = 0
  for (const b of bytes) {
    let v = b
    while (v) {
      v &= v - 1
      bits++
    }
  }
  const total = widthDots * heightDots
  return total > 0 ? `${((bits / total) * 100).toFixed(1)}%` : '—'
}

/** Measure the current design for the selected paper without touching Bluetooth. */
async function estimate(): Promise<void> {
  await guard(t('ble.actEstimate'), async () => {
    await ensurePrintFontCss()
    const paper = paperProfile()
    const printer = printerProfile()
    const { escposBytes, metadata } = await receiptLayersToEscposWithMetadata(
      PRINT_LAYERS.map((l) => ({ svg: buildPrintSvg(paper, l.layers), bitmap: l.opts() })),
      { printer, dots: paper.printableWidthDots, job: { feedAfterPrintMm: feedMm() } },
    )
    const ink = inkCoverage(escposBytes, metadata.widthDots, metadata.heightDots)
    setStatus(
      `${metadata.widthDots}×${metadata.heightDots} dots · ${metadata.estimatedLengthMm}mm · ` +
        `墨點 ${ink} · 一捲 20m 約 ${metadata.estimatedReceiptsPerRoll} 張`,
      'ok',
    )
    showDiagnostics({
      '墨點覆蓋 Ink': ink,
      '版面寬 Width (dots)': metadata.widthDots,
      '版面高 Height (dots)': metadata.heightDots,
      'Bytes / row': metadata.bytesPerRow,
      'ESC/POS bytes': escposBytes.length,
      '預估長度 Length (mm)': metadata.estimatedLengthMm,
      '一捲 20m 可印': metadata.estimatedReceiptsPerRoll,
    })
  })
}

/** Wire the BLE panel. Safe to call when the panel markup is absent. */
export function initBlePrint(): void {
  if (!document.getElementById('ble-print')) return

  $('ble-connect').addEventListener('click', () => void connect())
  $('ble-disconnect').addEventListener('click', () => disconnect())
  $('ble-print-btn').addEventListener('click', () => void printCurrent())
  $('ble-estimate').addEventListener('click', () => void estimate())
  $('ble-selftest').addEventListener('click', () => void selfTest())
  const bindRange = (id: string, out: string): void => {
    const i = $(id) as HTMLInputElement
    const o = $(out)
    const sync = (): void => {
      o.textContent = i.value
    }
    i.addEventListener('input', sync)
    sync()
  }
  bindRange('ble-threshold', 'ble-threshold-v')
  bindRange('ble-dotsize-text', 'ble-dotsize-text-v')
  bindRange('ble-threshold-logo', 'ble-threshold-logo-v')
  bindRange('ble-dotsize-logo', 'ble-dotsize-logo-v')
  bindRange('ble-threshold-bg', 'ble-threshold-bg-v')
  bindRange('ble-dotsize', 'ble-dotsize-v')
  bindRange('ble-threshold-st', 'ble-threshold-st-v')
  bindRange('ble-dotsize-st', 'ble-dotsize-st-v')
  bindRange('ble-bgdensity', 'ble-bgdensity-v')
  bindRange('ble-feed', 'ble-feed-v')
  for (const id of ['ble-ink-text', 'ble-threshold', 'ble-dotsize-text', 'ble-ink-logo', 'ble-threshold-logo', 'ble-dotsize-logo', 'ble-ink', 'ble-threshold-bg', 'ble-dotsize', 'ble-ink-stickers', 'ble-threshold-st', 'ble-dotsize-st', 'ble-bgdensity', 'ble-mono', 'ble-paper']) {
    $(id).addEventListener('input', schedulePreview)
    $(id).addEventListener('change', schedulePreview)
  }

  // Every control here must visibly do something, or it reads as a broken app. Two of them
  // are conditionally inert, so say so instead of leaving a live-looking slider that moves
  // nothing: the threshold cannot shift average tone under error diffusion (it conserves
  // input tone, so only the dot PATTERN changes), and artwork density needs artwork.
  const setLive = (id: string, live: boolean): void => {
    const el = $(id) as HTMLInputElement
    el.disabled = !live
    const row = el.closest('label') as HTMLElement | null
    if (row) row.style.opacity = live ? '1' : '0.4'
  }
  const syncLive = (): void => {
    // Grain only means anything to a screen; blackness is inert under full error diffusion,
    // which conserves input tone no matter where the threshold sits.
    $('ble-dotsize-text-row').style.display = sel('ble-ink-text').value.startsWith('halftone') ? '' : 'none'
    $('ble-dotsize-logo-row').style.display = sel('ble-ink-logo').value.startsWith('halftone') ? '' : 'none'
    $('ble-dotsize-row').style.display = sel('ble-ink').value.startsWith('halftone') ? '' : 'none'
    $('ble-dotsize-st-row').style.display = sel('ble-ink-stickers').value.startsWith('halftone') ? '' : 'none'
    setLive('ble-threshold', sel('ble-ink-text').value !== 'floyd-steinberg')
    setLive('ble-threshold-logo', sel('ble-ink-logo').value !== 'floyd-steinberg')
    setLive('ble-threshold-bg', sel('ble-ink').value !== 'floyd-steinberg')
    setLive('ble-threshold-st', sel('ble-ink-stickers').value !== 'floyd-steinberg')
    setLive('ble-bgdensity', !!bgAssets()?.backgroundImage)
  }
  syncLiveControls = syncLive
  for (const [inkId] of [['ble-ink-text'], ['ble-ink-logo'], ['ble-ink'], ['ble-ink-stickers']]) sel(inkId).addEventListener('change', syncLive)
  document.addEventListener('re:design-changed', () => {
    // The embedded faces are subsetted to the glyphs actually used, so changing the text or
    // the font picker invalidates them.
    printFontCss = null
    syncLive()
  })
  $('ble-print').addEventListener('toggle', () => {
    syncLive()
    if (($('ble-print') as HTMLDetailsElement).open) schedulePreview()
  })
  $('ble-estimate').addEventListener('click', syncLive)
  syncLive()
  // Seed the pacing from the profile on load, not only when the printer is changed —
  // otherwise the panel opens on the first <option> regardless of what the profile says.
  const syncPacing = (): void => {
    const profile = printerProfile()
    const cap = profile.maxChunkSize
    const modes = sel('ble-mode')
    for (const opt of [...modes.options]) {
      const size = getTransmissionMode(opt.value as TransmissionModeName).chunkSize
      opt.disabled = cap != null && size > cap
    }
    // A profile's default may name a pacing this build no longer offers — the generic
    // profiles ask for 'standard', which was dropped when the list was cut to three rungs.
    // Assigning it blanks the select and silently ignores whatever the user had chosen, so
    // fall back to the fastest rung the profile actually allows.
    const usable = [...modes.options].filter((o) => !o.disabled)
    const wanted = usable.find((o) => o.value === profile.defaultMode)
    modes.value = (wanted ?? usable[0])?.value ?? modes.options[0]!.value
  }
  syncPacing()
  $('ble-printer').addEventListener('change', () => {
    // A different printer means a different device and paper default.
    sel('ble-paper').value = printerProfile().paper.id
    syncPacing()
    transport?.disconnect()
    transport = null
    showDiagnostics()
  })

  if (!BleTransport.supported) {
    setStatus(t('ble.unsupported'), 'err')
    ;($('ble-connect') as HTMLButtonElement).disabled = true
    ;($('ble-print-btn') as HTMLButtonElement).disabled = true
  } else {
    setStatus(t('ble.notConnected'), 'idle')
  }
  showDiagnostics()
}
