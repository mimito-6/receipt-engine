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

/**
 * ESC J n — feed n DOTS (vertical motion units), the precise counterpart to
 * `feed()`'s whole lines. Needed to advance an exact number of millimetres so a
 * cutter-less portable printer clears its tear bar.
 *
 * n is a single byte, so feeds longer than 255 dots are emitted as repeated
 * commands rather than silently clamped.
 */
export function feedDots(dots = 0): number[] {
  let remaining = Math.max(0, Math.round(dots))
  const out: number[] = []
  while (remaining > 0) {
    const step = Math.min(255, remaining)
    out.push(ESC, 0x4a, step)
    remaining -= step
  }
  return out
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
