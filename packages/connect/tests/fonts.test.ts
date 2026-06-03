import { describe, expect, it } from 'vitest'
import { buildFontFaceCss } from '@receipt-engine/connect'

// Only the no-fetch paths are unit-tested here (network embedding is verified
// headlessly in the OpenBooth bridge). These confirm the family matcher doesn't
// fetch when nothing in the stack is a known embeddable family.
describe('buildFontFaceCss (matching)', () => {
  it('returns empty when no stacks given', async () => {
    expect(await buildFontFaceCss([], 'abc')).toBe('')
  })
  it('returns empty when no registry family matches (no fetch)', async () => {
    expect(await buildFontFaceCss(["'Helvetica Neue','Arial',sans-serif"], 'abc')).toBe('')
  })
  it('does not match a family without the surrounding quotes', async () => {
    // "Quicksand" as a bare substring (not '...') must not trigger embedding
    expect(await buildFontFaceCss(['Quicksandish, sans-serif'], 'abc')).toBe('')
  })
})
