// A fake Web Bluetooth stack, so the discovery/queue/state logic is testable with no
// hardware. This is the mock the real device work is validated against before plugging
// in an actual printer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BleTransport } from '../src/bluetooth'
import { GPRINTER_BLE_80, normalizeUuid } from '../src/profiles'

interface FakeCharOpts {
  uuid: string
  write?: boolean
  writeWithoutResponse?: boolean
  onWrite?: (v: Uint8Array) => void
  fail?: boolean
}

function fakeCharacteristic(o: FakeCharOpts) {
  const writes: Uint8Array[] = []
  return {
    uuid: o.uuid,
    writes,
    properties: { write: !!o.write, writeWithoutResponse: !!o.writeWithoutResponse },
    async writeValueWithoutResponse(v: Uint8Array) {
      if (o.fail) throw new Error('gatt write failed')
      writes.push(new Uint8Array(v))
      o.onWrite?.(v)
    },
    async writeValue(v: Uint8Array) {
      if (o.fail) throw new Error('gatt write failed')
      writes.push(new Uint8Array(v))
      o.onWrite?.(v)
    },
  }
}

function fakeService(uuid: string, chars: ReturnType<typeof fakeCharacteristic>[], throws = false) {
  return {
    uuid,
    async getCharacteristics() {
      if (throws) throw new Error('access denied')
      return chars
    },
  }
}

function installFakeBluetooth(services: ReturnType<typeof fakeService>[], deviceName = 'GP-M322') {
  const listeners: Record<string, Array<() => void>> = {}
  const device = {
    name: deviceName,
    gatt: {
      connected: false,
      async connect() {
        this.connected = true
        return { getPrimaryServices: async () => services }
      },
      disconnect() {
        this.connected = false
      },
    },
    addEventListener(ev: string, fn: () => void) {
      ;(listeners[ev] ??= []).push(fn)
    },
    removeEventListener(ev: string, fn: () => void) {
      listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn)
    },
    emit(ev: string) {
      for (const fn of listeners[ev] ?? []) fn()
    },
  }
  let requested: { optionalServices?: Array<string | number> } | undefined
  vi.stubGlobal('navigator', {
    bluetooth: {
      async requestDevice(opts: { optionalServices?: Array<string | number> }) {
        requested = opts
        return device
      },
    },
  })
  return { device, getRequestedOptions: () => requested }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const BASE = '-0000-1000-8000-00805f9b34fb'

describe('writable characteristic selection', () => {
  it('prefers writeWithoutResponse over write', async () => {
    const readOnly = fakeCharacteristic({ uuid: 'aaaa' + BASE })
    const writable = fakeCharacteristic({ uuid: 'bbbb' + BASE, write: true })
    const fast = fakeCharacteristic({ uuid: 'cccc' + BASE, writeWithoutResponse: true })
    installFakeBluetooth([fakeService('0000fee7' + BASE, [readOnly, writable, fast])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    const d = t.getDiagnostics()
    expect(d.writeMode).toBe('writeWithoutResponse')
    expect(d.characteristicUuid).toBe('cccc' + BASE)
    expect(d.serviceUuid).toBe('0000fee7' + BASE)
  })

  it('falls back to a plain write characteristic when none is write-without-response', async () => {
    const writable = fakeCharacteristic({ uuid: 'bbbb' + BASE, write: true })
    installFakeBluetooth([fakeService('49535343-fe7d-4ae5-8fa9-9fafd205e455', [writable])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    expect(t.getDiagnostics().writeMode).toBe('write')
  })

  it('skips services that refuse getCharacteristics instead of aborting', async () => {
    const good = fakeCharacteristic({ uuid: 'dddd' + BASE, writeWithoutResponse: true })
    installFakeBluetooth([
      fakeService('0000ff00' + BASE, [], true), // throws
      fakeService('0000fee7' + BASE, [good]),
    ])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    expect(t.getDiagnostics().characteristicUuid).toBe('dddd' + BASE)
  })

  it('throws a clear error when nothing is writable', async () => {
    installFakeBluetooth([fakeService('0000fee7' + BASE, [fakeCharacteristic({ uuid: 'eeee' + BASE })])])
    const t = new BleTransport(GPRINTER_BLE_80)
    await expect(t.connect()).rejects.toThrow(/characteristic/i)
    expect(t.state).toBe('error')
  })
})

describe('requestDevice options', () => {
  it('hints the Gprinter service UUIDs so they are accessible', async () => {
    const c = fakeCharacteristic({ uuid: 'ffff' + BASE, writeWithoutResponse: true })
    const { getRequestedOptions } = installFakeBluetooth([fakeService('0000fee7' + BASE, [c])])
    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    const hinted = (getRequestedOptions()?.optionalServices ?? []).map(normalizeUuid)
    expect(hinted).toContain('0000fee7' + BASE)
    expect(hinted).toContain('49535343-fe7d-4ae5-8fa9-9fafd205e455')
    // The pre-existing generic services must not be dropped.
    expect(hinted).toContain('000018f0' + BASE)
  })
})

describe('BLE write path', () => {
  it('chunks at the profile default (conservative = 20 bytes) and preserves bytes', async () => {
    const c = fakeCharacteristic({ uuid: 'aaaa' + BASE, writeWithoutResponse: true })
    installFakeBluetooth([fakeService('0000fee7' + BASE, [c])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    const payload = Uint8Array.from({ length: 105 }, (_, i) => i & 0xff)
    await t.write(payload)

    expect(c.writes.length).toBe(6) // ceil(105/20)
    const joined = new Uint8Array(c.writes.reduce((n, w) => n + w.length, 0))
    let at = 0
    for (const w of c.writes) {
      joined.set(w, at)
      at += w.length
    }
    expect(joined).toEqual(payload)
    expect(t.getDiagnostics().chunkCount).toBe(6)
    expect(t.getDiagnostics().bytesSent).toBe(105)
  })

  it('does not interleave two concurrent print jobs', async () => {
    const seen: number[] = []
    const c = fakeCharacteristic({
      uuid: 'aaaa' + BASE,
      writeWithoutResponse: true,
      onWrite: (v) => seen.push(v[0]!),
    })
    installFakeBluetooth([fakeService('0000fee7' + BASE, [c])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    const a = Uint8Array.from({ length: 60 }, () => 1)
    const b = Uint8Array.from({ length: 60 }, () => 2)
    await Promise.all([t.write(a, { delayMs: 0 }), t.write(b, { delayMs: 0 })])
    // All 1s then all 2s — never alternating.
    expect(seen.lastIndexOf(1)).toBeLessThan(seen.indexOf(2))
  })

  it('surfaces a mid-stream write failure instead of reporting success', async () => {
    const c = fakeCharacteristic({ uuid: 'aaaa' + BASE, writeWithoutResponse: true, fail: true })
    installFakeBluetooth([fakeService('0000fee7' + BASE, [c])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    await expect(t.write(Uint8Array.from({ length: 40 }, () => 9))).rejects.toThrow(/gatt write failed/)
    expect(t.state).toBe('error')
    expect(t.getDiagnostics().lastError).toMatch(/gatt write failed/)
  })
})

describe('connection lifecycle', () => {
  it('goes disconnected when the GATT server drops', async () => {
    const c = fakeCharacteristic({ uuid: 'aaaa' + BASE, writeWithoutResponse: true })
    const { device } = installFakeBluetooth([fakeService('0000fee7' + BASE, [c])])

    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    expect(t.state).toBe('connected')
    device.emit('gattserverdisconnected')
    expect(t.state).toBe('disconnected')
    expect(t.connected).toBe(false)
  })

  it('reports unsupported when the browser has no Web Bluetooth', async () => {
    vi.stubGlobal('navigator', {})
    const t = new BleTransport(GPRINTER_BLE_80)
    expect(t.state).toBe('unsupported')
    await expect(t.connect()).rejects.toThrow(/Web Bluetooth/)
  })

  it('exposes the device name for the UI', async () => {
    const c = fakeCharacteristic({ uuid: 'aaaa' + BASE, writeWithoutResponse: true })
    installFakeBluetooth([fakeService('0000fee7' + BASE, [c])], 'GP-M322 BLE')
    const t = new BleTransport(GPRINTER_BLE_80)
    await t.connect()
    expect(t.getDiagnostics().deviceName).toBe('GP-M322 BLE')
  })
})
