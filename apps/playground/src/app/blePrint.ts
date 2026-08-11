// BLE thermal printing for the design currently open in the editor.
//
// The point of this panel (versus the standalone print-test page) is that it prints
// WHAT YOU DESIGNED — the live receipt, look, padding, stickers and block order — with its
// composition intact. The design's SVG is rasterized straight to the head width, which keeps
// the exact proportions AND is natively 576 dots (vector re-render, not a bitmap upscale).
import { PAPER_58, PAPER_80, type PaperProfile } from '@receipt-engine/core'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { mergeTheme } from '@receipt-engine/themes'
import {
  BleTransport,
  getPrinterProfile,
  getTransmissionMode,
  receiptSvgToEscposWithMetadata,
  type PrinterProfile,
  type TransmissionModeName,
} from '@receipt-engine/connect'
import { $ } from './dom'
import { currentTheme, renderOpts } from './render'
import { state } from './state'
import { toast } from './feel'

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
  $('ble-diag').innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="ble-row"><span>${k}</span><span>${v === undefined || v === '' ? '—' : String(v)}</span></div>`,
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
function buildPrintSvg(_paper: PaperProfile): string {
  const extra: Record<string, unknown> = {
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
function bitmapOpts(): {
  dither: 'none' | 'floyd-steinberg' | 'hybrid'
  threshold: number
  inkFloor: number
  paperCeil: number
} {
  const threshold = Number(($('ble-threshold') as HTMLInputElement).value) || 170
  // Pinned, not exposed: 255 is bare paper, so this clamp has almost no usable travel and
  // only decides whether faint tone prints AT ALL — never how strongly. Density is set in
  // the vector domain by printDoc(), where the control has real range.
  const paperCeil = 250
  const dither = ($('ble-ink') as HTMLSelectElement).value as 'none' | 'floyd-steinberg' | 'hybrid'
  // In hybrid the threshold names the solid-ink floor: everything darker prints solid, so the
  // slider reads as glyph weight rather than as a global on/off point.
  return { dither, threshold, inkFloor: threshold, paperCeil }
}

/**
 * Blank paper advanced after the image. Defaults to 20mm rather than the library's neutral
 * 12mm: this printer has no cutter, so the trailing edge has to clear the tear bar by hand.
 */
function feedMm(): number {
  return Number(($('ble-feed') as HTMLInputElement).value) || 0
}

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
function nextStepHint(msg: string): string {
  if (!/GATT operation failed|not supported|longer than/i.test(msg)) return ''
  const size = getTransmissionMode(sel('ble-mode').value as TransmissionModeName).chunkSize
  if (size <= 180) return ' — 這台機器連 180B 都吃不下,請退到 Fast · 100B / 5ms'
  return ` — ${size}B 送不出去。先試「大包慢送」(同樣大小但有間隔):若通過就是送太快、不是封包太大;若一樣失敗,退回 Turbo · 180B`
}

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    // Silently dropping the click was indistinguishable from "the app is broken".
    setStatus(`還在忙(上一個工作尚未結束)—— 若卡住請按「中斷」再重連`, 'busy')
    return
  }
  busy = true
  try {
    await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`${label} 失敗:${msg}${nextStepHint(msg)}`, 'err')
    toast(`${label} 失敗`)
    showDiagnostics()
  } finally {
    busy = false
  }
}

async function connect(): Promise<void> {
  await guard('連線', async () => {
    const t = ensureTransport()
    setStatus('連線中…', 'busy')
    await t.connect()
    setStatus(`已連線:${t.name ?? '印表機'}`, 'ok')
    showDiagnostics()
  })
}

function disconnect(): void {
  transport?.disconnect()
  transport = null
  // Also clear the in-flight flag: "中斷" doubles as the escape hatch when a job has hung,
  // otherwise the panel stays permanently unresponsive with no way back.
  busy = false
  setStatus('已中斷連線(已重置)', 'idle')
  showDiagnostics()
}

/** Render → raster → ESC/POS → BLE for the live design. */
async function printCurrent(): Promise<void> {
  await guard('列印', async () => {
    const paper = paperProfile()
    const printer = printerProfile()
    const svg = buildPrintSvg(paper)
    const { escposBytes, metadata } = await receiptSvgToEscposWithMetadata(svg, {
      printer,
      dots: paper.printableWidthDots,
      bitmap: bitmapOpts(),
      job: { feedAfterPrintMm: feedMm() },
    })
    const stats = {
      '版面寬 Width (dots)': metadata.widthDots,
      '版面高 Height (dots)': metadata.heightDots,
      'Bytes / row': metadata.bytesPerRow,
      'ESC/POS bytes': escposBytes.length,
      '預估長度 Length (mm)': metadata.estimatedLengthMm,
      '一捲 20m 可印': metadata.estimatedReceiptsPerRoll,
    }
    setStatus(`列印中… ${escposBytes.length} bytes`, 'busy')
    showDiagnostics(stats)
    const t = ensureTransport()
    // Repaint at most ~10×/s: refreshing on every chunk meant thousands of innerHTML
    // rebuilds mid-transfer, which starved the very stream we were trying to keep fed.
    let lastPaint = 0
    await t.write(escposBytes, {
      mode: sel('ble-mode').value as TransmissionModeName,
      requireAck: checked('ble-ack'),
      onProgress: (sent, total) => {
        const now = Date.now()
        if (now - lastPaint < 100 && sent < total) return
        lastPaint = now
        setStatus(`列印中… ${sent} / ${total} bytes`, 'busy')
        showDiagnostics(stats)
      },
    })
    setStatus(`已送出 ${escposBytes.length} bytes(${metadata.widthDots} dots)`, 'ok')
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
  await guard('自我測試', async () => {
    const bytes = selfTestBytes()
    const t = ensureTransport()
    setStatus(`自我測試:送出 ${bytes.length} bytes 純文字…`, 'busy')
    await t.write(bytes, {
      mode: sel('ble-mode').value as TransmissionModeName,
      requireAck: checked('ble-ack'),
    })
    setStatus(`自我測試已送出 ${bytes.length} bytes — 印表機有吐紙嗎?`, 'ok')
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
  await guard('估算', async () => {
    const paper = paperProfile()
    const printer = printerProfile()
    const svg = buildPrintSvg(paper)
    const { escposBytes, metadata } = await receiptSvgToEscposWithMetadata(svg, {
      printer,
      dots: paper.printableWidthDots,
      bitmap: bitmapOpts(),
      job: { feedAfterPrintMm: feedMm() },
    })
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
  bindRange('ble-bgdensity', 'ble-bgdensity-v')
  bindRange('ble-feed', 'ble-feed-v')

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
  const ink = $('ble-ink') as HTMLSelectElement
  const syncLive = (): void => {
    setLive('ble-threshold', ink.value !== 'floyd-steinberg')
    setLive('ble-bgdensity', !!bgAssets()?.backgroundImage)
  }
  ink.addEventListener('change', syncLive)
  $('ble-print').addEventListener('toggle', syncLive)
  $('ble-estimate').addEventListener('click', syncLive)
  syncLive()
  // Seed the pacing from the profile on load, not only when the printer is changed —
  // otherwise the panel opens on the first <option> regardless of what the profile says.
  sel('ble-mode').value = printerProfile().defaultMode
  $('ble-printer').addEventListener('change', () => {
    // A different printer means a different device and paper default.
    sel('ble-paper').value = printerProfile().paper.id
    sel('ble-mode').value = printerProfile().defaultMode
    transport?.disconnect()
    transport = null
    showDiagnostics()
  })

  if (!BleTransport.supported) {
    setStatus('此瀏覽器不支援 Web Bluetooth。請用 Chrome / Edge(手機或桌機皆可);Safari、Firefox 不支援', 'err')
    ;($('ble-connect') as HTMLButtonElement).disabled = true
    ;($('ble-print-btn') as HTMLButtonElement).disabled = true
  } else {
    setStatus('尚未連線', 'idle')
  }
  showDiagnostics()
}
