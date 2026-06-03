// Basic ESC/POS control commands. Each returns raw bytes (number[]) so callers
// can concatenate freely; buildPrintJob() flattens to a Uint8Array.

export const ESC = 0x1b
export const GS = 0x1d

/** ESC @ — initialize / reset the printer. */
export function init(): number[] {
  return [ESC, 0x40]
}

/** ESC d n — feed n lines. */
export function feed(lines = 0): number[] {
  return [ESC, 0x64, Math.max(0, Math.min(255, Math.round(lines)))]
}

/** ESC a n — alignment (0 left, 1 center, 2 right). */
export function align(a: 'left' | 'center' | 'right'): number[] {
  const n = a === 'center' ? 1 : a === 'right' ? 2 : 0
  return [ESC, 0x61, n]
}

/**
 * GS V — cut paper. By default a partial cut after feeding `feedUnits` dots
 * (function B: GS V 66 n). Pass {partial:false} for a full cut (function A).
 */
export function cut(opts: { partial?: boolean; feedUnits?: number } = {}): number[] {
  const { partial = true, feedUnits } = opts
  if (feedUnits != null) {
    return [GS, 0x56, 66, Math.max(0, Math.min(255, Math.round(feedUnits)))]
  }
  return [GS, 0x56, partial ? 1 : 0]
}
