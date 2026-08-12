// BLE thermal-printer test bench.
//
// Purpose: prove an actual printer works — over real Web Bluetooth, from a real phone —
// without any host app. Everything the engine can get wrong (dot width, raster bytes,
// chunk pacing, cut commands) is surfaced on screen so a bad print can be diagnosed
// from the page rather than guessed at.
import { PAPER_58, PAPER_80, receiptMetadata, type PaperProfile } from '@receipt-engine/core'
import { renderReceiptWithMetadata } from '@receipt-engine/render-svg'
import { buildPrintJob } from '@receipt-engine/escpos'
import {
  BleTransport,
  getPrinterProfile,
  receiptSvgToEscposWithMetadata,
  type PrinterProfile,
  type PrinterState,
  type TransmissionModeName,
} from '@receipt-engine/connect'
import { longReceipt, qrReceipt, rasterTestPattern, testReceipt } from './fixtures'

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el
}
const val = (id: string): string => ($(id) as HTMLSelectElement).value

let transport: BleTransport | null = null
let busy = false

// ---------------------------------------------------------------------------
// Status + diagnostics
// ---------------------------------------------------------------------------

type UiStatus = PrinterState | 'success' | 'failed'

function setStatus(status: UiStatus, detail = ''): void {
  const el = $('status')
  el.dataset.state = status
  el.textContent = detail ? `${status} — ${detail}` : status
}

function log(line: string): void {
  const el = $('log')
  const stamp = new Date().toLocaleTimeString()
  el.textContent = `[${stamp}] ${line}\n${el.textContent}`.slice(0, 8000)
}

const NA = '—'

function renderDiagnostics(extra: Record<string, string | number | undefined> = {}): void {
  const d = transport?.getDiagnostics()
  const rows: Array<[string, string | number | undefined]> = [
    ['Web Bluetooth supported', BleTransport.supported ? 'yes' : 'NO — use Chrome/Edge (phone or desktop)'],
    ['State', d?.state ?? 'disconnected'],
    ['Device name', d?.deviceName],
    ['Service UUID', d?.serviceUuid],
    ['Characteristic UUID', d?.characteristicUuid],
    ['Write mode', d?.writeMode],
    ['Chunk size', d?.chunkSize],
    ['Delay (ms)', d?.delayMs],
    ['Bytes sent', d ? `${d.bytesSent} / ${d.totalBytes}` : undefined],
    ['Chunk count', d?.chunkCount],
    ...(Object.entries(extra) as Array<[string, string | number | undefined]>),
    ['Last error', d?.lastError],
  ]
  $('diag').innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="row"><span class="k">${k}</span><span class="v">${
          v === undefined || v === '' ? NA : String(v)
        }</span></div>`,
    )
    .join('')
}

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

function currentPrinter(): PrinterProfile {
  const p = getPrinterProfile(val('printer'))
  if (!p) throw new Error(`unknown printer profile: ${val('printer')}`)
  return p
}

/**
 * The paper selector overrides the profile's own paper, so an 80mm printer can be
 * asked to print a 58mm page (a useful A/B when a print comes out wrong).
 */
function currentPaper(): PaperProfile {
  return val('paper') === '58mm' ? PAPER_58 : PAPER_80
}

function currentMode(): TransmissionModeName {
  return val('mode') as TransmissionModeName
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Render a receipt to a thermal SVG at the selected paper width. */
function renderFor(doc: ReturnType<typeof testReceipt>): { svg: string; heightDots: number } {
  const paper = currentPaper()
  const { svg, metadata } = renderReceiptWithMetadata(doc, {
    theme: 'thermal',
    paper,
    perforatedEdges: false,
    // A thermal head prints black on the paper's own white — a page background would
    // just burn ink (and battery) for nothing.
    transparentBackground: true,
  })
  return { svg, heightDots: metadata.heightDots }
}

function showPreview(svg: string): void {
  $('preview').innerHTML = svg
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  if (busy) {
    log(`${label}: ignored, a job is already running`)
    return
  }
  busy = true
  try {
    await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus('failed', msg)
    log(`${label} FAILED: ${msg}`)
    renderDiagnostics()
  } finally {
    busy = false
  }
}

function ensureTransport(): BleTransport {
  const profile = currentPrinter()
  if (!transport) {
    transport = new BleTransport(profile)
    transport.onStateChange = (s) => {
      // Don't clobber a terminal success/failure message with the transport's own state.
      if (s === 'printing' || s === 'connecting' || s === 'disconnected') setStatus(s)
      renderDiagnostics()
    }
  }
  return transport
}

async function connect(): Promise<void> {
  await guard('connect', async () => {
    const t = ensureTransport()
    setStatus('connecting')
    await t.connect()
    setStatus('connected', t.name ?? '')
    log(`connected to ${t.name ?? 'printer'}`)
    renderDiagnostics()
  })
}

async function disconnect(): Promise<void> {
  transport?.disconnect()
  // Disconnect doubles as the reset when a job has hung: without clearing these, every later
  // click is silently swallowed by the busy guard and the bench looks dead. The editor panel
  // already does this; the bench did not.
  transport = null
  busy = false
  setStatus('disconnected')
  log('disconnected (reset)')
  renderDiagnostics()
}

/** Send an already-built ESC/POS job and report byte-level progress. */
async function sendJob(label: string, bytes: Uint8Array, extra: Record<string, string | number>): Promise<void> {
  const t = ensureTransport()
  setStatus('printing', `${bytes.length} bytes`)
  log(`${label}: sending ${bytes.length} bytes (${currentMode()} mode)`)
  await t.write(bytes, {
    mode: currentMode(),
    onProgress: (sent, total) => {
      setStatus('printing', `${sent} / ${total} bytes`)
      renderDiagnostics(extra)
    },
  })
  setStatus('success', `${label} sent (${bytes.length} bytes)`)
  log(`${label}: OK`)
  renderDiagnostics(extra)
}

/** Render → raster → ESC/POS → BLE, the full production path. */
async function printReceipt(label: string, doc: ReturnType<typeof testReceipt>): Promise<void> {
  await guard(label, async () => {
    const printer = currentPrinter()
    const paper = currentPaper()
    const { svg } = renderFor(doc)
    showPreview(svg)
    const { escposBytes, metadata } = await receiptSvgToEscposWithMetadata(svg, {
      printer,
      dots: paper.printableWidthDots,
    })
    await sendJob(label, escposBytes, {
      'Receipt width (dots)': metadata.widthDots,
      'Receipt height (dots)': metadata.heightDots,
      'Bytes per row': metadata.bytesPerRow,
      'Estimated length (mm)': metadata.estimatedLengthMm,
      'Receipts / 20m roll': metadata.estimatedReceiptsPerRoll,
    })
  })
}

/** Print the synthetic alignment pattern straight from bits — no SVG in the path. */
async function printRasterTest(): Promise<void> {
  await guard('raster test', async () => {
    const printer = currentPrinter()
    const paper = currentPaper()
    const bmp = rasterTestPattern(paper.printableWidthDots)
    const bytes = buildPrintJob(bmp, {
      supportsCut: printer.supportsCut,
      feedAfterPrintMm: printer.feedAfterPrintMm,
      dpi: paper.dpi,
      align: 'left',
    })
    const md = receiptMetadata({
      widthDots: bmp.width,
      heightDots: bmp.height,
      dpi: paper.dpi,
      feedAfterPrintMm: printer.feedAfterPrintMm,
    })
    await sendJob('raster test', bytes, {
      'Receipt width (dots)': md.widthDots,
      'Receipt height (dots)': md.heightDots,
      'Bytes per row': md.bytesPerRow,
      'Estimated length (mm)': md.estimatedLengthMm,
      'Receipts / 20m roll': md.estimatedReceiptsPerRoll,
    })
  })
}

/** Render + measure without touching Bluetooth — safe to run on a desktop. */
async function renderPreview(): Promise<void> {
  await guard('render preview', async () => {
    const paper = currentPaper()
    const printer = currentPrinter()
    const { svg } = renderFor(testReceipt())
    showPreview(svg)
    const { escposBytes, metadata } = await receiptSvgToEscposWithMetadata(svg, {
      printer,
      dots: paper.printableWidthDots,
    })
    setStatus('success', `rendered ${metadata.widthDots}×${metadata.heightDots} dots`)
    log(
      `preview: ${metadata.widthDots}×${metadata.heightDots} dots, ` +
        `${metadata.bytesPerRow} bytes/row, ${escposBytes.length} ESC/POS bytes, ` +
        `${metadata.estimatedLengthMm}mm, ~${metadata.estimatedReceiptsPerRoll} per 20m roll`,
    )
    renderDiagnostics({
      'Receipt width (dots)': metadata.widthDots,
      'Receipt height (dots)': metadata.heightDots,
      'Bytes per row': metadata.bytesPerRow,
      'ESC/POS bytes': escposBytes.length,
      'Estimated length (mm)': metadata.estimatedLengthMm,
      'Receipts / 20m roll': metadata.estimatedReceiptsPerRoll,
    })
  })
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function syncProfileDefaults(): void {
  // Selecting a printer profile pulls its paper + pacing along, but both stay editable.
  // Setting `.value` in code does NOT fire 'change', so the caller re-renders explicitly.
  const p = currentPrinter()
  ;($('paper') as HTMLSelectElement).value = p.paper.id
  ;($('mode') as HTMLSelectElement).value = p.defaultMode
  // A profile change means a different device: drop any existing link.
  if (transport) {
    transport.disconnect()
    transport = null
  }
}

function init(): void {
  $('btn-connect').addEventListener('click', () => void connect())
  $('btn-disconnect').addEventListener('click', () => void disconnect())
  $('btn-preview').addEventListener('click', () => void renderPreview())
  $('btn-test').addEventListener('click', () => void printReceipt('test print', testReceipt()))
  $('btn-raster').addEventListener('click', () => void printRasterTest())
  $('btn-long').addEventListener('click', () => void printReceipt('long receipt', longReceipt()))
  $('btn-qr').addEventListener('click', () => void printReceipt('QR test', qrReceipt()))
  $('printer').addEventListener('change', () => {
    syncProfileDefaults()
    void renderPreview()
  })
  $('paper').addEventListener('change', () => void renderPreview())
  $('mode').addEventListener('change', () => renderDiagnostics())

  if (!BleTransport.supported) {
    setStatus('unsupported', '此瀏覽器沒有 Web Bluetooth。請用 Chrome / Edge(手機或桌機皆可);Safari、Firefox 不支援')
    log('Web Bluetooth unavailable — rendering still works, printing does not.')
  } else {
    setStatus('disconnected')
  }
  syncProfileDefaults()
  void renderPreview()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
