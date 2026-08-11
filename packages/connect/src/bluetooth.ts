// Web Bluetooth transport for ESC/POS thermal printers (Android Chrome/Edge; NOT iOS
// Safari, which has no Web Bluetooth at all). The API is experimental and largely
// untyped in TS, so the GATT surface is treated loosely.
//
// Characteristics are DISCOVERED, never hard-coded: every printer family puts its write
// characteristic under a different UUID, and a hard-coded guess silently fails on the
// next model.
import {
  ALL_KNOWN_SERVICE_UUIDS,
  getTransmissionMode,
  normalizeUuid,
  type PrinterProfile,
  type TransmissionMode,
} from './profiles'
import {
  Mutex,
  resolvePacing,
  sleep,
  type PrinterState,
  type Transport,
  type TransportDiagnostics,
  type WriteOptions,
} from './transport'
import { chunk } from './chunk'

export interface PrintOptions extends WriteOptions {
  /** Bytes per GATT write. Kept for backwards compatibility with pre-profile callers. */
  chunkSize?: number
  /** Delay between chunks in ms. */
  delayMs?: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface FoundCharacteristic {
  characteristic: any
  serviceUuid: string
  characteristicUuid: string
  writeMode: 'writeWithoutResponse' | 'write'
}

/**
 * Walk every accessible primary service and return the first writable characteristic,
 * preferring `writeWithoutResponse` (far faster on BLE: no per-packet round trip).
 * Services that refuse `getCharacteristics` are skipped rather than aborting the scan —
 * printers routinely expose services the page has no permission for.
 */
async function findWritableCharacteristic(server: any): Promise<FoundCharacteristic> {
  const services = await server.getPrimaryServices()
  let fallback: FoundCharacteristic | null = null
  for (const svc of services) {
    let chars: any[] = []
    try {
      chars = await svc.getCharacteristics()
    } catch {
      continue
    }
    for (const c of chars) {
      const found = {
        characteristic: c,
        serviceUuid: normalizeUuid(String(svc.uuid ?? '')),
        characteristicUuid: normalizeUuid(String(c.uuid ?? '')),
      }
      if (c.properties?.writeWithoutResponse) {
        return { ...found, writeMode: 'writeWithoutResponse' }
      }
      if (c.properties?.write && !fallback) {
        fallback = { ...found, writeMode: 'write' }
      }
    }
  }
  if (fallback) return fallback
  throw new Error('找不到可寫入的列印特徵(characteristic)')
}

/** A reusable Web Bluetooth printer connection implementing the Transport contract. */
export class BleTransport implements Transport {
  private device: any = null
  private found: FoundCharacteristic | null = null
  private _state: PrinterState = 'disconnected'
  private mutex = new Mutex()
  private fallbackMode: TransmissionMode
  private serviceHints: Array<string | number>
  private lastError?: string
  private stats = { bytesSent: 0, totalBytes: 0, chunkCount: 0, chunkSize: 0, delayMs: 0 }
  private onDisconnected?: () => void

  /** Notified whenever the state changes, so a UI can re-render without polling. */
  onStateChange?: (state: PrinterState) => void

  constructor(private profile?: PrinterProfile) {
    this.fallbackMode = getTransmissionMode(profile?.defaultMode ?? 'conservative')
    // Always hint every known service: Web Bluetooth denies access to any service not
    // declared in optionalServices, and a profile's own list is only a display hint.
    const hints = new Set<string>(ALL_KNOWN_SERVICE_UUIDS.map(normalizeUuid))
    for (const u of profile?.serviceUuids ?? []) hints.add(normalizeUuid(u))
    this.serviceHints = [...hints]
    if (!BleTransport.supported) this._state = 'unsupported'
  }

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth
  }

  get state(): PrinterState {
    return this._state
  }

  get name(): string | undefined {
    return this.device?.name
  }

  get connected(): boolean {
    return !!this.device?.gatt?.connected && !!this.found
  }

  private setState(s: PrinterState): void {
    this._state = s
    this.onStateChange?.(s)
  }

  /** Show the chooser, connect GATT, and locate the write characteristic. */
  async connect(): Promise<void> {
    if (!BleTransport.supported) {
      this.setState('unsupported')
      throw new Error('此瀏覽器不支援 Web Bluetooth(iPhone / Safari 不支援;請用 Android Chrome)')
    }
    this.setState('connecting')
    try {
      const bt = (navigator as any).bluetooth
      // acceptAllDevices: printers advertise wildly inconsistent names/services, and a
      // filter that misses means the device simply never appears in the chooser.
      this.device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.serviceHints,
      })
      this.onDisconnected = () => {
        this.found = null
        this.setState('disconnected')
      }
      this.device.addEventListener?.('gattserverdisconnected', this.onDisconnected)
      const server = await this.device.gatt.connect()
      this.found = await findWritableCharacteristic(server)
      this.lastError = undefined
      this.setState('connected')
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.setState('error')
      throw err
    }
  }

  /**
   * Send raw bytes. Serialized through a mutex so two jobs can never interleave on the
   * characteristic, and a failed write rejects immediately — a partially-written receipt
   * must never be reported as success.
   */
  write(bytes: Uint8Array, opts: WriteOptions = {}): Promise<void> {
    return this.mutex.run(async () => {
      if (!this.connected) await this.connect()
      const found = this.found
      if (!found) throw new Error('BLE transport is not connected')
      const pacing = resolvePacing(opts, this.fallbackMode)
      const parts = chunk(bytes, pacing.chunkSize)
      this.stats = {
        bytesSent: 0,
        totalBytes: bytes.length,
        chunkCount: parts.length,
        chunkSize: pacing.chunkSize,
        delayMs: pacing.delayMs,
      }
      this.setState('printing')
      try {
        let sent = 0
        for (const part of parts) {
          if (found.writeMode === 'writeWithoutResponse' && found.characteristic.writeValueWithoutResponse) {
            await found.characteristic.writeValueWithoutResponse(part)
          } else {
            await found.characteristic.writeValue(part)
          }
          sent += part.length
          this.stats.bytesSent = sent
          opts.onProgress?.(sent, bytes.length)
          if (pacing.delayMs) await sleep(pacing.delayMs)
        }
        this.setState('connected')
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        this.setState('error')
        throw err
      }
    })
  }

  disconnect(): void {
    try {
      if (this.onDisconnected) {
        this.device?.removeEventListener?.('gattserverdisconnected', this.onDisconnected)
      }
      this.device?.gatt?.disconnect()
    } catch {
      /* ignore — the link may already be gone */
    }
    this.found = null
    this.onDisconnected = undefined
    this.setState('disconnected')
  }

  getDiagnostics(): TransportDiagnostics {
    return {
      state: this._state,
      deviceName: this.device?.name,
      serviceUuid: this.found?.serviceUuid,
      characteristicUuid: this.found?.characteristicUuid,
      writeMode: this.found?.writeMode,
      chunkSize: this.stats.chunkSize || this.fallbackMode.chunkSize,
      delayMs: this.stats.delayMs || this.fallbackMode.delayMs,
      bytesSent: this.stats.bytesSent,
      totalBytes: this.stats.totalBytes,
      chunkCount: this.stats.chunkCount,
      lastError: this.lastError,
    }
  }
}

/**
 * Backwards-compatible wrapper preserving the original class name and surface
 * (`connect` / `print` / `disconnect` / `connected` / `name`), now backed by
 * BleTransport so existing callers gain the queue, state machine and diagnostics.
 */
export class BluetoothThermalPrinter {
  readonly transport: BleTransport

  constructor(profile?: PrinterProfile) {
    this.transport = new BleTransport(profile)
  }

  static get supported(): boolean {
    return BleTransport.supported
  }

  get connected(): boolean {
    return this.transport.connected
  }

  get name(): string | undefined {
    return this.transport.name
  }

  get state(): PrinterState {
    return this.transport.state
  }

  connect(): Promise<void> {
    return this.transport.connect()
  }

  print(bytes: Uint8Array, opts: PrintOptions = {}): Promise<void> {
    return this.transport.write(bytes, opts)
  }

  disconnect(): void {
    this.transport.disconnect()
  }

  getDiagnostics(): TransportDiagnostics {
    return this.transport.getDiagnostics()
  }
}

/** One-shot: pick a printer and print (shows the chooser each call). */
export async function printViaBluetooth(bytes: Uint8Array, opts: PrintOptions = {}): Promise<void> {
  const printer = new BluetoothThermalPrinter()
  await printer.print(bytes, opts)
}
