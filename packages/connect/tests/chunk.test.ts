import { describe, expect, it } from 'vitest'
import { chunk } from '@receipt-engine/connect'

describe('chunk', () => {
  it('splits into <=size pieces preserving order and bytes', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5])
    const parts = chunk(bytes, 2)
    expect(parts.map((p) => Array.from(p))).toEqual([[1, 2], [3, 4], [5]])
  })
  it('returns one chunk when size >= length', () => {
    expect(chunk(Uint8Array.from([1, 2, 3]), 10)).toHaveLength(1)
  })
  it('returns empty for empty input', () => {
    expect(chunk(new Uint8Array(0), 4)).toEqual([])
  })
  it('rejects non-positive size', () => {
    expect(() => chunk(Uint8Array.from([1]), 0)).toThrow()
  })
  it('chunks are views into the same buffer (subarray)', () => {
    const bytes = Uint8Array.from([9, 8, 7, 6])
    const parts = chunk(bytes, 2)
    expect(parts[0].buffer).toBe(bytes.buffer)
  })
})
