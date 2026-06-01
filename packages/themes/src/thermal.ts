import type { ReceiptTheme } from './types'

/** Black & white, narrow, monospace — mimics thermal paper, no color dependency. */
export const thermalTheme: ReceiptTheme = {
  name: 'thermal',
  mode: 'thermal',
  palette: {
    background: '#ffffff',
    surface: '#ffffff',
    primary: '#000000',
    secondary: '#000000',
    text: '#000000',
    mutedText: '#2b2b2b',
    border: '#000000',
  },
  typography: {
    fontFamily:
      "'Courier New', 'DejaVu Sans Mono', 'Consolas', 'Noto Sans Mono CJK TC', monospace",
    titleSize: 20,
    bodySize: 13,
    smallSize: 11,
  },
  radius: { card: 0, block: 0 },
  spacing: { page: 16, section: 12, row: 7 },
  decoration: { borderStyle: 'dashed', showCornerStars: false, showItemBadges: false },
}
