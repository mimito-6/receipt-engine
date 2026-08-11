// Transport abstraction: the seam between "make the bytes" and "get them to a printer".
//
// Two reasons this exists rather than callers holding a concrete Web Bluetooth class:
//  1. Web Bluetooth cannot run in a test runner, so without an interface the entire
//     print path is untestable. A MemoryTransport makes the chunking/queueing testable
//     with no hardware.
//  2. USB/serial/network transports become drop-in later.
import { chunk, sleep } from './chunk'
import { getTransmissionMode, type TransmissionMode, type TransmissionModeName } from './profiles'

/** Lifecycle of a printer connection, for driving UI without guessing. */
export type PrinterState =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'error'

/** What a UI needs to show to prove the link is real and diagnose a bad one. */
export interface TransportDiagnostics {
  state: PrinterState
  deviceName?: string
  /** The GATT service the write characteristic was found on. */
  serviceUuid?: string
  characteristicUuid?: string
  writeMode?: 'writeWithoutResponse' | 'write'
  chunkSize: number
  delayMs: number
  /** Bytes acknowledged by the transport so far in the current/last job. */
  bytesSent: number
  totalBytes: number
  chunkCount: number
  lastError?: string
}

export interface WriteOptions {
  /** Named pacing preset; ignored when explicit chunkSize/delayMs are given. */
  mode?: TransmissionModeName
  chunkSize?: number
  delayMs?: number
  /** Progress callback, fired after each acknowledged chunk. */
  onProgress?: (sent: number, total: number) => void
}

export interface Transport {
  readonly state: PrinterState
  connect(): Promise<void>
  disconnect(): Promise<void> | void
  /** Send raw bytes. Resolves only when every byte has been acknowledged. */
  write(bytes: Uint8Array, opts?: WriteOptions): Promise<void>
  getDiagnostics(): TransportDiagnostics
}

/**
 * Serialize async jobs. Two print jobs interleaving on one characteristic produces a
 * garbled receipt that still "succeeds", so every write goes through this — the failure
 * mode it prevents is silent and unrecoverable.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(job: () => Promise<T>): Promise<T> {
    // Chain onto the tail, but swallow the PREVIOUS job's rejection here so one failed
    // job doesn't poison every job queued behind it.
    const result = this.tail.then(job, job)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

/** Resolve a job's pacing from an explicit override, else the named mode. */
export function resolvePacing(opts: WriteOptions | undefined, fallback: TransmissionMode): TransmissionMode {
  const base = opts?.mode ? getTransmissionMode(opts.mode) : fallback
  return {
    name: base.name,
    chunkSize: Math.max(1, opts?.chunkSize ?? base.chunkSize),
    delayMs: Math.max(0, opts?.delayMs ?? base.delayMs),
  }
}

/**
 * A transport that keeps every chunk in memory. Used by tests to assert chunking,
 * ordering and non-interleaving without hardware, and by the demo's "dry run".
 */
export class MemoryTransport implements Transport {
  readonly chunks: Uint8Array[] = []
  private _state: PrinterState = 'disconnected'
  private mutex = new Mutex()
  private diag: TransportDiagnostics = {
    state: 'disconnected',
    chunkSize: 0,
    delayMs: 0,
    bytesSent: 0,
    totalBytes: 0,
    chunkCount: 0,
  }

  /** Optional hook to simulate a mid-stream failure at a given chunk index. */
  failAtChunk?: number

  constructor(private fallbackMode: TransmissionMode = getTransmissionMode('conservative')) {}

  get state(): PrinterState {
    return this._state
  }

  /** Every byte written so far, concatenated — for `chunks == original` assertions. */
  get written(): Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    return out
  }

  async connect(): Promise<void> {
    this._state = 'connecting'
    this._state = 'connected'
    this.diag = { ...this.diag, state: 'connected', deviceName: 'MemoryTransport' }
  }

  disconnect(): void {
    this._state = 'disconnected'
    this.diag = { ...this.diag, state: 'disconnected' }
  }

  write(bytes: Uint8Array, opts: WriteOptions = {}): Promise<void> {
    return this.mutex.run(async () => {
      if (this._state !== 'connected') await this.connect()
      const pacing = resolvePacing(opts, this.fallbackMode)
      const parts = chunk(bytes, pacing.chunkSize)
      this._state = 'printing'
      this.diag = {
        ...this.diag,
        state: 'printing',
        chunkSize: pacing.chunkSize,
        delayMs: pacing.delayMs,
        bytesSent: 0,
        totalBytes: bytes.length,
        chunkCount: parts.length,
        lastError: undefined,
      }
      let sent = 0
      for (let i = 0; i < parts.length; i++) {
        if (this.failAtChunk === i) {
          this._state = 'error'
          this.diag = { ...this.diag, state: 'error', lastError: 'simulated write failure' }
          throw new Error('simulated write failure')
        }
        // Copy: chunk() returns views into the caller's buffer, which a caller may reuse.
        this.chunks.push(new Uint8Array(parts[i]!))
        sent += parts[i]!.length
        this.diag = { ...this.diag, bytesSent: sent }
        opts.onProgress?.(sent, bytes.length)
      }
      this._state = 'connected'
      this.diag = { ...this.diag, state: 'connected' }
    })
  }

  getDiagnostics(): TransportDiagnostics {
    return { ...this.diag, state: this._state }
  }
}

export { sleep }
