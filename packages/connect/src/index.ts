// @receipt-engine/connect — browser delivery for receipts.
//   • Web Bluetooth ESC/POS thermal printing (Android Chrome/Edge; not iOS)
//   • Web Share to the customer's phone (download fallback)
//   • canvas SVG→ImageData/PNG bridge + one-call compose flows
export { chunk, sleep } from './chunk'
export { BluetoothThermalPrinter, printViaBluetooth } from './bluetooth'
export type { PrintOptions } from './bluetooth'
export { shareReceipt, canShareFiles, downloadBlob } from './share'
export type { ShareResult, ShareOptions } from './share'
export { loadSvgImage, svgToImageData, svgToPngBlob } from './raster-browser'
export type { RasterImageData } from './raster-browser'
export { printReceiptSvg, receiptSvgToEscpos, shareReceiptSvg } from './compose'
export type { PrintReceiptOptions } from './compose'
