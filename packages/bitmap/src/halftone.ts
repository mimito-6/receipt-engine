// Shaped halftone screening — the alternative to error diffusion for mid-tones.
//
// A thermal head has one decision per dot: burn or don't. Grey does not exist, so every
// tone between ink and paper has to be faked by covering some fraction of the area. The
// only real choice is HOW that coverage is arranged.
//
// Error diffusion scatters isolated dots to approximate tone as closely as possible. It is
// the most faithful, and it looks like noise — and on a thermal head an isolated dot is also
// the least reliable mark there is, because a single element gets less heat than one with
// burning neighbours, so fine stipple prints weak and grey.
//
// Screening instead grows one dot per cell from the centre outward. The marks are larger and
// clustered, so they burn solidly, and the texture is a regular pattern rather than noise —
// the way newsprint has always done it. The cost is tonal resolution: an N x N cell can only
// express N^2 + 1 levels.
//
// Because the growth order is arbitrary, the dot can be any shape at all. That is not a
// gimmick here: on a receipt with a hand-drawn look, a heart or star screen reads as a
// deliberate texture where scattered noise reads as a printer fault.

export type SpotShape = 'round' | 'diamond' | 'line' | 'heart' | 'star'

/** Is (x, y) inside the unit heart? y points up. */
function insideHeart(x: number, y: number): boolean {
  const a = x * x + y * y - 1
  return a * a * a - x * x * y * y * y <= 0
}

/**
 * How far out the shape's boundary is along this point's own ray, as a fraction.
 *
 * Ranking by the implicit function's VALUE was wrong, and visibly so: a polynomial's minimum
 * region is not the shape, so the heart grew as a four-pointed blob and only the white gaps
 * became hearts at dark tones. What has to be ranked is the scale at which the point lands on
 * the boundary — then every level set is the shape itself, scaled, and the dot grows as a
 * heart from the first pixel to the last.
 *
 * Found by bisection because the heart has no closed-form polar radius. It runs once per cell
 * of a cached matrix — at most a few hundred times ever.
 */
function heartRatio(u: number, v: number): number {
  const y = -v // v runs downward; the heart is defined with y up
  if (u === 0 && y === 0) return 0
  // p/s is inside for large s and outside for small s, so the predicate is monotone.
  let lo = 1e-4
  let hi = 4
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    if (insideHeart(u / mid, y / mid)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * Growth order for a spot shape. Lower fills first, so the shape grows outward from wherever
 * this function is smallest. `u`/`v` are cell coordinates in [-1, 1], v downward.
 */
function spotValue(shape: SpotShape, u: number, v: number): number {
  switch (shape) {
    case 'diamond':
      return Math.abs(u) + Math.abs(v)
    case 'line':
      // A diagonal ruling that thickens with tone, rather than a dot that grows.
      return Math.abs(u + v)
    case 'heart':
      return heartRatio(u, v)
    case 'star': {
      // Five lobes, points up. Normalised so the longest point just reaches the cell edge —
      // unnormalised, the points ran past the cell and came back clipped into triangles.
      const r = Math.hypot(u, v)
      const theta = Math.atan2(-v, u) - Math.PI / 2
      const R = (1 + 0.6 * Math.cos(5 * theta)) / 1.6
      return r / R
    }
    default:
      return u * u + v * v
  }
}

/**
 * An `size` x `size` threshold matrix in [0, 1), ordered so that a cell's dot grows in the
 * given shape as tone darkens.
 *
 * Built by ranking rather than by evaluating the shape function directly: the raw values have
 * wildly different scales between shapes (the heart polynomial spans orders of magnitude),
 * and only their ORDER matters. Ranking also guarantees every level is used exactly once, so
 * a flat tone can never band.
 */
export function buildSpotMatrix(size: number, shape: SpotShape): Float32Array {
  const n = Math.max(2, Math.min(32, Math.round(size)))
  const cells: Array<{ i: number; v: number }> = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Cell centres in [-1, 1]. Every shape is normalised to just fill that box, so none of
      // them runs off the cell and comes back clipped.
      const u = ((x + 0.5) / n - 0.5) * 2
      const v = ((y + 0.5) / n - 0.5) * 2
      cells.push({ i: y * n + x, v: spotValue(shape, u, v) })
    }
  }
  cells.sort((a, b) => a.v - b.v)
  const m = new Float32Array(n * n)
  for (let rank = 0; rank < cells.length; rank++) {
    // DESCENDING thresholds. Ordered dithering inks a cell when tone falls below its
    // threshold, so the cells that ink FIRST — while the image is still light — are the ones
    // holding the HIGHEST thresholds. Numbering the shape's centre lowest therefore grows the
    // dot from the cell corners inward, printing the exact complement of the shape: hearts
    // appeared as white holes at dark tones instead of as marks at light ones.
    m[cells[rank]!.i] = 1 - (rank + 0.5) / cells.length
  }
  return m
}

const cache = new Map<string, { size: number; matrix: Float32Array }>()

/** Cached matrix — screening a full receipt would otherwise rebuild it per call. */
export function spotMatrix(size: number, shape: SpotShape): { size: number; matrix: Float32Array } {
  const key = `${size}:${shape}`
  let hit = cache.get(key)
  if (!hit) {
    const n = Math.max(2, Math.min(32, Math.round(size)))
    hit = { size: n, matrix: buildSpotMatrix(n, shape) }
    cache.set(key, hit)
  }
  return hit
}
