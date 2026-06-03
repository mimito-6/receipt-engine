// Electronic delivery: hand the receipt to the customer's phone via the native
// share sheet (Web Share API with a file — works on modern Android & iOS Safari
// 15+), falling back to a plain download where file-sharing isn't available.

export interface ShareResult {
  shared: boolean
  aborted?: boolean
}

export interface ShareOptions {
  title?: string
  text?: string
  filename?: string
}

function asFile(blob: Blob | File, filename: string): File {
  if (blob instanceof File) return blob
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

export function downloadBlob(blob: Blob | File, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 800)
}

/**
 * Share a rendered receipt (PNG blob) to the customer's phone. Uses
 * navigator.share({files}) when the device allows it, otherwise downloads.
 */
export async function shareReceipt(
  blob: Blob | File,
  opts: ShareOptions = {},
): Promise<ShareResult> {
  const filename = opts.filename ?? 'receipt.png'
  const file = asFile(blob, filename)
  const nav = navigator as any
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: opts.title, text: opts.text })
      return { shared: true }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return { shared: false, aborted: true }
      // fall through to download on any other share failure
    }
  }
  downloadBlob(file, filename)
  return { shared: false }
}

/** True when the browser can share files (vs. only able to download). */
export function canShareFiles(): boolean {
  const nav = navigator as any
  if (!nav.canShare || !nav.share) return false
  try {
    return nav.canShare({ files: [new File([new Uint8Array([0])], 'x.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}
