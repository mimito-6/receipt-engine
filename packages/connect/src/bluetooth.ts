// Web Bluetooth transport for ESC/POS thermal printers (Android Chrome/Edge;
// NOT iOS — see README). The API is experimental and largely untyped in TS, so
// the GATT surface is treated loosely. Pair once, then reuse the connection.
import { chunk, sleep } from './chunk'

// Common GATT services exposed by generic 58/80mm BLE ESC/POS printers (and a
// few popular models). We accept all devices and then discover a writable
// characteristic, so this list is only an optionalServices hint.
const KNOWN_SERVICES: Array<string | number> = [
  '000018f0-0000-1000-8000-00805f9b34fb', // generic ESC/POS
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb', // some Phomemo
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / many clones
  0x18f0,
  0xff00,
]

export interface PrintOptions {
  /** Bytes per GATT write (default 200; kept under the negotiated MTU). */
  chunkSize?: number
  /** Delay between chunks in ms (default 20) so the printer buffer keeps up. */
  delayMs?: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function findWritableCharacteristic(server: any): Promise<any> {
  const services = await server.getPrimaryServices()
  for (const svc of services) {
    let chars: any[] = []
    try {
      chars = await svc.getCharacteristics()
    } catch {
      continue
    }
    for (const c of chars) {
      if (c.properties?.writeWithoutResponse || c.properties?.write) return c
    }
  }
  throw new Error('找不到可寫入的列印特徵(characteristic)')
}

async function writeAll(characteristic: any, bytes: Uint8Array, opts: PrintOptions): Promise<void> {
  const size = opts.chunkSize ?? 200
  const delay = opts.delayMs ?? 20
  const canNoResp = !!characteristic.properties?.writeWithoutResponse
  for (const part of chunk(bytes, size)) {
    if (canNoResp && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(part)
    } else {
      await characteristic.writeValue(part)
    }
    if (delay) await sleep(delay)
  }
}

/** A reusable Web Bluetooth thermal printer connection. */
export class BluetoothThermalPrinter {
  private device: any = null
  private characteristic: any = null

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth
  }

  get connected(): boolean {
    return !!this.device?.gatt?.connected && !!this.characteristic
  }

  get name(): string | undefined {
    return this.device?.name
  }

  /** Show the chooser, connect GATT, and locate the write characteristic. */
  async connect(): Promise<void> {
    if (!BluetoothThermalPrinter.supported) {
      throw new Error('此瀏覽器不支援 Web Bluetooth(iPhone/Safari 不支援;請用 Android Chrome)')
    }
    const bt = (navigator as any).bluetooth
    this.device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: KNOWN_SERVICES })
    const server = await this.device.gatt.connect()
    this.characteristic = await findWritableCharacteristic(server)
  }

  /** Send raw ESC/POS bytes (connecting first if needed). */
  async print(bytes: Uint8Array, opts: PrintOptions = {}): Promise<void> {
    if (!this.connected) await this.connect()
    await writeAll(this.characteristic, bytes, opts)
  }

  disconnect(): void {
    try {
      this.device?.gatt?.disconnect()
    } catch {
      /* ignore */
    }
    this.characteristic = null
  }
}

/** One-shot: pick a printer and print (shows the chooser each call). */
export async function printViaBluetooth(bytes: Uint8Array, opts: PrintOptions = {}): Promise<void> {
  const printer = new BluetoothThermalPrinter()
  await printer.print(bytes, opts)
}
