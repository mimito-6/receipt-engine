// Pack a black map (1 = black) into MSB-first rows: ceil(width/8) bytes per row,
// leftmost pixel = bit 0x80, trailing bits in the last byte padded with 0.

export function packBits(black: ArrayLike<number>, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8)
  const out = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit
        if (x < width && black[y * width + x]) byte |= 0x80 >> bit
      }
      out[y * bytesPerRow + bx] = byte
    }
  }
  return out
}
