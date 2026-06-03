// Pure helper: split a byte stream into <=size chunks (BLE GATT writes are
// MTU-limited, so a full receipt raster must be sent in pieces).
export function chunk(bytes: Uint8Array, size: number): Uint8Array[] {
  if (size <= 0) throw new Error('chunk size must be > 0')
  const out: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size))
  return out
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
