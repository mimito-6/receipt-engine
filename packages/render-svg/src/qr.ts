import qrcode from 'qrcode-generator'
import { escapeXml } from './escape'

export interface QrOptions {
  size?: number
  /** Quiet-zone width in modules. */
  margin?: number
  dark?: string
  light?: string
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

interface QrPath {
  path: string
  size: number
  light: string
  dark: string
}

function buildQrPath(value: string, options: QrOptions): QrPath {
  const size = options.size ?? 132
  const margin = options.margin ?? 2
  const dark = options.dark ?? '#000000'
  const light = options.light ?? '#ffffff'

  // typeNumber 0 = auto-size, 'M' = ~15% error correction.
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()

  const count = qr.getModuleCount()
  const cell = size / (count + margin * 2)

  let path = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue
      const x = round((col + margin) * cell)
      const y = round((row + margin) * cell)
      const c = round(cell)
      path += `M${x} ${y}h${c}v${c}h${-c}z`
    }
  }
  return { path, size, light, dark }
}

/**
 * Render an embeddable QR `<g>` translated to (x, y), including a light
 * background so it stays scannable on a colored card.
 */
export function renderQrGroup(
  value: string,
  options: QrOptions & { x?: number; y?: number } = {},
): string {
  const { path, size, light, dark } = buildQrPath(value, options)
  const x = options.x ?? 0
  const y = options.y ?? 0
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect width="${size}" height="${size}" fill="${escapeXml(light)}" />` +
    `<path d="${path}" fill="${escapeXml(dark)}" shape-rendering="crispEdges" />` +
    `</g>`
  )
}

/** Render a standalone QR code as a complete `<svg>` document string. */
export function renderQrSvg(value: string, options: QrOptions = {}): string {
  const size = options.size ?? 132
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    renderQrGroup(value, options) +
    `</svg>`
  )
}
