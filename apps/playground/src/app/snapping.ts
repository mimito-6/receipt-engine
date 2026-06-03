// Pure alignment-snapping math (no DOM). Given a dragged point and the
// snap targets (card center lines + other stickers), returns a snapped point
// plus the guide lines to draw. Keeps the editor's "auto-center / auto-align".

export interface Guide {
  axis: 'x' | 'y'
  pos: number
}
export interface SnapResult {
  x: number
  y: number
  guides: Guide[]
}
export interface SnapInput {
  width: number
  height: number
  others: { x: number; y: number }[]
  threshold?: number
}

/** Snap (x,y) to the nearest card center line or peer-sticker edge within threshold. */
export function snapSticker(x: number, y: number, opts: SnapInput): SnapResult {
  const t = opts.threshold ?? 7
  const xs = [opts.width / 2, ...opts.others.map((o) => o.x)]
  const ys = [opts.height / 2, ...opts.others.map((o) => o.y)]

  let sx = x
  let sy = y
  const guides: Guide[] = []

  let bestX = t + 1
  for (const tx of xs) {
    const d = Math.abs(x - tx)
    if (d < t && d < bestX) {
      bestX = d
      sx = tx
    }
  }
  if (bestX <= t) guides.push({ axis: 'x', pos: sx })

  let bestY = t + 1
  for (const ty of ys) {
    const d = Math.abs(y - ty)
    if (d < t && d < bestY) {
      bestY = d
      sy = ty
    }
  }
  if (bestY <= t) guides.push({ axis: 'y', pos: sy })

  return { x: sx, y: sy, guides }
}
