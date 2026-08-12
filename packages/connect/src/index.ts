// @receipt-engine/connect — browser delivery for receipts.
//   • Web Bluetooth ESC/POS thermal printing (Android Chrome/Edge; not iOS)
//   • Web Share to the customer's phone (download fallback)
//   • canvas SVG→ImageData/PNG bridge + one-call compose flows
export { chunk, sleep } from './chunk'
export { BleTransport, BluetoothThermalPrinter, printViaBluetooth } from './bluetooth'
export type { PrintOptions } from './bluetooth'
export { Mutex, MemoryTransport, resolvePacing } from './transport'
export type {
  PrinterState,
  Transport,
  TransportDiagnostics,
  WriteOptions,
} from './transport'
export {
  TRANSMISSION_MODES,
  getTransmissionMode,
  GPRINTER_SERVICE_UUIDS,
  GENERIC_SERVICE_UUIDS,
  ALL_KNOWN_SERVICE_UUIDS,
  normalizeUuid,
  sameUuid,
  GPRINTER_BLE_80,
  GENERIC_BLE_58,
  GENERIC_BLE_80,
  PRINTER_PROFILES,
  getPrinterProfile,
} from './profiles'
export type { PrinterProfile, TransmissionMode, TransmissionModeName } from './profiles'
export { shareReceipt, canShareFiles, downloadBlob } from './share'
export type { ShareResult, ShareOptions } from './share'
export { loadSvgImage, svgToImageData, svgToPngBlob } from './raster-browser'
export type { RasterImageData } from './raster-browser'
export {
  printReceiptSvg,
  receiptSvgToEscpos,
  receiptSvgToEscposWithMetadata,
  shareReceiptSvg,
} from './compose'
export type { PrintReceiptOptions, PrintSink, EscposBuildResult } from './compose'
export { buildFontFaceCss } from './fonts'
export type { FontEmbedOptions } from './fonts'
export { renderReceipt, Printer } from './api'
export type { RenderReceiptOptions, ReceiptResult, PrinterOptions } from './api'

// Types a consumer needs in order to pass the options the façade accepts. Without these the
// options exist but cannot be typed at the call site.
export type { ToBitmapOptions, DitherMode, SpotShape } from '@receipt-engine/bitmap'
export type { PrintJobOptions } from '@receipt-engine/escpos'
export type { PaperProfile, ReceiptMetadata } from '@receipt-engine/core'
