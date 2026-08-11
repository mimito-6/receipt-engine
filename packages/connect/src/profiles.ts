// Printer profiles: what a specific BLE printer needs in order to be driven safely.
//
// A paper profile (core) says how wide the page is. A PRINTER profile says how to talk
// to the machine: which GATT services to hint, how fast it can swallow bytes, whether it
// has a cutter, and how far to feed so the receipt clears the tear bar. Keeping the two
// apart means an 80mm page can be printed on any 80mm printer.
import { PAPER_58, PAPER_80, type PaperProfile } from '@receipt-engine/core'

/**
 * BLE write pacing. Cheap printers drop bytes when a burst outruns their buffer, and the
 * safe rate is per-model, so it is a named mode rather than a magic number.
 */
export type TransmissionModeName = 'conservative' | 'standard' | 'fast' | 'turbo'

export interface TransmissionMode {
  name: TransmissionModeName
  /** Bytes per GATT write. Must stay under the negotiated MTU (20 is the safe floor). */
  chunkSize: number
  /** Pause after each write, in ms. */
  delayMs: number
}

export const TRANSMISSION_MODES: Record<TransmissionModeName, TransmissionMode> = {
  conservative: { name: 'conservative', chunkSize: 20, delayMs: 20 },
  standard: { name: 'standard', chunkSize: 50, delayMs: 10 },
  fast: { name: 'fast', chunkSize: 100, delayMs: 5 },
  // A thermal head prints far faster than BLE can feed it, so a slow stream makes the
  // motor stop and restart between bands ("stuttering"). Turbo pushes the largest packet
  // a typical negotiated MTU allows with no artificial delay. If the link rejects the
  // size the write throws — visibly — rather than corrupting the print.
  turbo: { name: 'turbo', chunkSize: 180, delayMs: 0 },
}

export function getTransmissionMode(name: TransmissionModeName): TransmissionMode {
  return TRANSMISSION_MODES[name] ?? TRANSMISSION_MODES.conservative
}

// ---------------------------------------------------------------------------
// GATT service UUIDs
// ---------------------------------------------------------------------------

/** Gprinter / ISSC-family services, including the one used by Gprinter's BLE SDK. */
export const GPRINTER_SERVICE_UUIDS = [
  '0000fee7-0000-1000-8000-00805f9b34fb', // Gprinter BLE SDK
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / many clones
]

/** Services seen on generic 58/80mm BLE ESC/POS printers. */
export const GENERIC_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // generic ESC/POS
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb', // some Phomemo
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style serial bridges
]

/**
 * Every service we hint to `requestDevice`. Web Bluetooth refuses access to any
 * service not declared up front, so this is a superset — profiles narrow it only for
 * display, never to restrict discovery.
 */
export const ALL_KNOWN_SERVICE_UUIDS = [
  ...new Set([...GPRINTER_SERVICE_UUIDS, ...GENERIC_SERVICE_UUIDS]),
]

/**
 * Normalize a UUID for comparison: lower-case, and expand a 16/32-bit short form
 * (`0xFEE7`, `'FEE7'`, `'0000FEE7'`) to its full 128-bit Bluetooth Base UUID. Without
 * this, `'0000FEE7-…'` and `0xfee7` look like different services.
 */
export function normalizeUuid(uuid: string | number): string {
  if (typeof uuid === 'number') {
    return `${uuid.toString(16).padStart(8, '0')}-0000-1000-8000-00805f9b34fb`
  }
  const raw = uuid.trim().toLowerCase().replace(/^0x/, '')
  if (/^[0-9a-f]{1,8}$/.test(raw)) {
    return `${raw.padStart(8, '0')}-0000-1000-8000-00805f9b34fb`
  }
  return raw
}

/** True when two UUIDs denote the same service, regardless of form. */
export function sameUuid(a: string | number, b: string | number): boolean {
  return normalizeUuid(a) === normalizeUuid(b)
}

// ---------------------------------------------------------------------------
// Printer profiles
// ---------------------------------------------------------------------------

export interface PrinterProfile {
  id: string
  name: string
  /** GATT services hinted to `requestDevice` for this printer. */
  serviceUuids: string[]
  /** Page geometry this printer expects. */
  paper: PaperProfile
  /** Starting BLE pacing; the caller may override per job. */
  defaultMode: TransmissionModeName
  /** Portable printers have no cutter — emitting `GS V` at one is wrong. */
  supportsCut: boolean
  /** Blank paper advanced after printing so the receipt clears the tear bar, in mm. */
  feedAfterPrintMm: number
  /** Image encoding this printer accepts. Only `GS v 0` raster is implemented. */
  rasterMode: 'gs-v0'
}

/**
 * Gprinter 80mm portable BLE (the target device). No cutter, conservative pacing:
 * these units are the ones most prone to dropping a fast burst.
 */
export const GPRINTER_BLE_80: PrinterProfile = {
  id: 'gprinter-ble-80',
  name: 'Gprinter BLE 80mm',
  serviceUuids: [...GPRINTER_SERVICE_UUIDS],
  paper: PAPER_80,
  defaultMode: 'conservative',
  supportsCut: false,
  feedAfterPrintMm: 12,
  rasterMode: 'gs-v0',
}

export const GENERIC_BLE_58: PrinterProfile = {
  id: 'generic-58',
  name: 'Generic BLE 58mm',
  serviceUuids: [...ALL_KNOWN_SERVICE_UUIDS],
  paper: PAPER_58,
  defaultMode: 'standard',
  supportsCut: false,
  feedAfterPrintMm: 10,
  rasterMode: 'gs-v0',
}

export const GENERIC_BLE_80: PrinterProfile = {
  id: 'generic-80',
  name: 'Generic BLE 80mm',
  serviceUuids: [...ALL_KNOWN_SERVICE_UUIDS],
  paper: PAPER_80,
  defaultMode: 'standard',
  supportsCut: false,
  feedAfterPrintMm: 12,
  rasterMode: 'gs-v0',
}

export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  [GPRINTER_BLE_80.id]: GPRINTER_BLE_80,
  [GENERIC_BLE_58.id]: GENERIC_BLE_58,
  [GENERIC_BLE_80.id]: GENERIC_BLE_80,
}

export function getPrinterProfile(id: string): PrinterProfile | undefined {
  return PRINTER_PROFILES[id]
}
