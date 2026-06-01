const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/**
 * Escape a value for safe inclusion in SVG/XML text and attributes.
 * Every piece of user-supplied content must pass through this before output.
 */
export function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char)
}
