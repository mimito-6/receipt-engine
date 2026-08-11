import { describe, expect, it } from 'vitest'
import { MemoryTransport, Mutex, resolvePacing } from '../src/transport'
import { TRANSMISSION_MODES, getTransmissionMode, normalizeUuid, sameUuid } from '../src/profiles'

const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i & 0xff)

describe('transmission modes', () => {
  it('defines conservative / standard / fast as specified', () => {
    expect(TRANSMISSION_MODES.conservative).toMatchObject({ chunkSize: 20, delayMs: 20 })
    expect(TRANSMISSION_MODES.standard).toMatchObject({ chunkSize: 50, delayMs: 10 })
    expect(TRANSMISSION_MODES.fast).toMatchObject({ chunkSize: 100, delayMs: 5 })
  })

  it('falls back to conservative for an unknown mode', () => {
    expect(getTransmissionMode('nope' as never).chunkSize).toBe(20)
  })

  it('lets an explicit chunkSize/delay override the named mode', () => {
    const p = resolvePacing({ mode: 'fast', chunkSize: 7 }, TRANSMISSION_MODES.conservative)
    expect(p.chunkSize).toBe(7)
    expect(p.delayMs).toBe(5) // still the fast mode's delay
  })
})

describe('chunked writing', () => {
  it('sends 20-byte chunks without losing data', async () => {
    const t = new MemoryTransport()
    const payload = bytes(205)
    await t.write(payload, { mode: 'conservative' })
    expect(t.chunks.length).toBe(11) // ceil(205/20)
    expect(t.chunks[0]!.length).toBe(20)
    expect(t.chunks.at(-1)!.length).toBe(5)
    expect(t.getDiagnostics().bytesSent).toBe(205)
  })

  it('concatenated chunks equal the original bytes', async () => {
    const t = new MemoryTransport()
    const payload = bytes(1000)
    await t.write(payload, { mode: 'conservative' })
    expect(t.written).toEqual(payload)
  })

  it('preserves byte order across every mode', async () => {
    for (const mode of ['conservative', 'standard', 'fast'] as const) {
      const t = new MemoryTransport()
      const payload = bytes(333)
      await t.write(payload, { mode })
      expect(t.written).toEqual(payload)
    }
  })

  it('reports progress monotonically up to the total', async () => {
    const t = new MemoryTransport()
    const seen: number[] = []
    await t.write(bytes(100), { mode: 'conservative', onProgress: (s) => seen.push(s) })
    expect(seen).toEqual([20, 40, 60, 80, 100])
  })
})

describe('job queueing', () => {
  it('does not interleave two concurrent jobs', async () => {
    const t = new MemoryTransport()
    const a = Uint8Array.from({ length: 60 }, () => 0xaa)
    const b = Uint8Array.from({ length: 60 }, () => 0xbb)
    // Fire both without awaiting the first: a naive implementation interleaves them.
    await Promise.all([t.write(a, { mode: 'conservative' }), t.write(b, { mode: 'conservative' })])
    const out = t.written
    expect(out.length).toBe(120)
    // Every 0xaa must precede every 0xbb.
    const firstB = out.indexOf(0xbb)
    const lastA = out.lastIndexOf(0xaa)
    expect(lastA).toBeLessThan(firstB)
  })

  it('serializes jobs through the mutex in submission order', async () => {
    const m = new Mutex()
    const order: string[] = []
    const job = (id: string, ms: number) => async () => {
      order.push(`${id}:start`)
      await new Promise((r) => setTimeout(r, ms))
      order.push(`${id}:end`)
    }
    await Promise.all([m.run(job('a', 20)), m.run(job('b', 1))])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('a failed job does not block the queue behind it', async () => {
    const m = new Mutex()
    const failed = m.run(async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(m.run(async () => 'ok')).resolves.toBe('ok')
  })
})

describe('write failure handling', () => {
  it('rejects immediately and never reports success', async () => {
    const t = new MemoryTransport()
    t.failAtChunk = 3
    await expect(t.write(bytes(200), { mode: 'conservative' })).rejects.toThrow('simulated write failure')
    // Stopped at the failing chunk — no further bytes were claimed as sent.
    expect(t.chunks.length).toBe(3)
    expect(t.getDiagnostics().state).toBe('error')
    expect(t.getDiagnostics().lastError).toBeTruthy()
  })
})

describe('UUID normalization', () => {
  it('expands 16-bit short forms to the Bluetooth base UUID', () => {
    expect(normalizeUuid(0xfee7)).toBe('0000fee7-0000-1000-8000-00805f9b34fb')
    expect(normalizeUuid('FEE7')).toBe('0000fee7-0000-1000-8000-00805f9b34fb')
    expect(normalizeUuid('0x18F0')).toBe('000018f0-0000-1000-8000-00805f9b34fb')
  })

  it('lower-cases an already-full UUID', () => {
    expect(normalizeUuid('0000FEE7-0000-1000-8000-00805F9B34FB')).toBe(
      '0000fee7-0000-1000-8000-00805f9b34fb',
    )
  })

  it('treats the short and long Gprinter forms as the same service', () => {
    expect(sameUuid(0xfee7, '0000FEE7-0000-1000-8000-00805F9B34FB')).toBe(true)
    expect(sameUuid('49535343-FE7D-4AE5-8FA9-9FAFD205E455', '49535343-fe7d-4ae5-8fa9-9fafd205e455')).toBe(true)
    expect(sameUuid(0xfee7, 0x18f0)).toBe(false)
  })
})
