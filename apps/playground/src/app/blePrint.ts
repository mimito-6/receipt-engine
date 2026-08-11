// BLE thermal printing for the design currently open in the editor.
//
// The point of this panel (versus the standalone print-test page) is that it prints
// WHAT YOU DESIGNED — the live receipt, look, padding and block order — re-laid-out at
// the printer's dot width. Nothing is scaled: a 576-dot print is a 576-dot layout, so
// text stays crisp instead of being an upscaled 384-dot bitmap.
import { PAPER_58, PAPER_80, type PaperProfile } from '@receipt-engine/core'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { getTheme } from '@receipt-engine/themes'
import {
  BleTransport,
  getPrinterProfile,
  receiptSvgToEscposWithMetadata,
  type PrinterProfile,
  type TransmissionModeName,
} from '@receipt-engine/connect'
import { $ } from './dom'
import { renderOpts } from './render'
import { curPad, curWidth, state } from './state'
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
 * Render the CURRENT editor design at the printer's dot width.
 *
 * The user's own padding is scaled by the width ratio so the design keeps its
 * proportions on a narrower/wider head, rather than inheriting 720px-tuned margins.
 */
function buildPrintSvg(paper: PaperProfile): string {
  const dots = paper.printableWidthDots
  const ratio = dots / Math.max(1, curWidth())
  const pad = curPad()
  const extra: Record<string, unknown> = {
    paper,
    width: dots,
    padX: Math.round(pad.x * ratio),
    padTop: Math.round(pad.top * ratio),
    padBottom: Math.round(pad.bottom * ratio),
    // Thermal paper is already white and every dot costs ink and battery, so the page
    // background never prints.
    transparentBackground: true,
    monochromeImages: true,
  }
  // "白底黑字" re-renders the design through the thermal theme: a dark template would
  // otherwise burn a solid black receipt.
  if (checked('ble-mono')) extra.theme = getTheme('thermal')
  return renderReceiptToSvg(state.receipt as never, renderOpts(extra) as never)
}

function ensureTransport(): BleTransport {
  if (!transport) {
    transport = new BleTransport(printerProfile())
    transport.onStateChange = () => showDiagnostics()
  }
  return transport
}

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  if (busy) return
  busy = true
  try {
    await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`${label} 失敗:${msg}`, 'err')
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
  setStatus('已中斷連線', 'idle')
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
    await t.write(escposBytes, {
      mode: sel('ble-mode').value as TransmissionModeName,
      onProgress: (sent, total) => {
        setStatus(`列印中… ${sent} / ${total} bytes`, 'busy')
        showDiagnostics(stats)
      },
    })
    setStatus(`已送出 ${escposBytes.length} bytes(${metadata.widthDots} dots)`, 'ok')
    toast('已送到印表機')
    showDiagnostics(stats)
  })
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
    })
    setStatus(
      `${metadata.widthDots}×${metadata.heightDots} dots · ${metadata.estimatedLengthMm}mm · ` +
        `一捲 20m 約 ${metadata.estimatedReceiptsPerRoll} 張`,
      'ok',
    )
    showDiagnostics({
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
  $('ble-printer').addEventListener('change', () => {
    // A different printer means a different device and paper default.
    sel('ble-paper').value = printerProfile().paper.id
    sel('ble-mode').value = printerProfile().defaultMode
    transport?.disconnect()
    transport = null
    showDiagnostics()
  })

  if (!BleTransport.supported) {
    setStatus('此瀏覽器不支援 Web Bluetooth(請用 Android Chrome;iOS 不支援)', 'err')
    ;($('ble-connect') as HTMLButtonElement).disabled = true
    ;($('ble-print-btn') as HTMLButtonElement).disabled = true
  } else {
    setStatus('尚未連線', 'idle')
  }
  showDiagnostics()
}
