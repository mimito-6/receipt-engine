// Browser canvas helpers: rasterize an SVG string to ImageData (for the thermal
// print path) or to a PNG blob (for the share path). Composites over white so
// transparent areas don't print/print as black.

export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG 載入失敗(可能含外部網址圖片)'))
    }
    img.src = url
  })
}

export interface RasterImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Rasterize an SVG to RGBA at a target width (default = the printer head dots
 * you pass, e.g. 384 for 58mm / 576 for 80mm). Height scales proportionally.
 */
export async function svgToImageData(
  svg: string,
  opts: { width?: number; background?: string } = {},
): Promise<RasterImageData> {
  const img = await loadSvgImage(svg)
  const natW = img.naturalWidth || opts.width || 384
  const natH = img.naturalHeight || natW
  const width = Math.max(1, Math.round(opts.width ?? natW))
  const height = Math.max(1, Math.round((natH * width) / natW))
  const cv = document.createElement('canvas')
  cv.width = width
  cv.height = height
  const cx = cv.getContext('2d')!
  cx.fillStyle = opts.background ?? '#ffffff'
  cx.fillRect(0, 0, width, height)
  cx.drawImage(img, 0, 0, width, height)
  const id = cx.getImageData(0, 0, width, height)
  return { data: id.data, width, height }
}

/** Rasterize an SVG to a PNG blob at `pixelRatio` × its natural size. */
export async function svgToPngBlob(svg: string, opts: { pixelRatio?: number } = {}): Promise<Blob> {
  const img = await loadSvgImage(svg)
  const sc = opts.pixelRatio ?? 2
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(img.naturalWidth * sc))
  cv.height = Math.max(1, Math.round(img.naturalHeight * sc))
  const cx = cv.getContext('2d')!
  cx.fillStyle = '#ffffff'
  cx.fillRect(0, 0, cv.width, cv.height)
  cx.scale(sc, sc)
  cx.drawImage(img, 0, 0)
  return new Promise((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 轉檔失敗'))), 'image/png')
  })
}
