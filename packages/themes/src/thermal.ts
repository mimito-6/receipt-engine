import type { ReceiptTheme } from './types'

/**
 * Black & white, narrow, monospace — a real till-receipt look inspired by
 * thermal paper: torn/perforated edges, dotted leader lines, and every embedded
 * image auto-converted to black & white. No color dependency.
 */
export const thermalTheme: ReceiptTheme = {
  name: 'thermal',
  mode: 'thermal',
  palette: {
    background: '#e7e7e7', // the "desk" the paper sits on
    surface: '#fbfbfb', // the paper
    primary: '#111111',
    secondary: '#333333',
    text: '#1a1a1a',
    mutedText: '#555555',
    border: '#1a1a1a',
  },
  typography: {
    // Monospace Latin (Space Mono) + a TRUE monospace CJK (Sarasa Mono TC) before
    // system fonts, so CJK keeps the fixed-width column alignment.
    fontFamily:
      "'Space Mono','Sarasa Mono TC','Noto Sans Mono CJK TC','DejaVu Sans Mono','Consolas',monospace",
    titleSize: 20,
    bodySize: 13,
    smallSize: 11,
  },
  radius: { card: 0, block: 0 },
  spacing: { page: 18, section: 13, row: 8 },
  decoration: {
    borderStyle: 'dashed',
    showCornerStars: false,
    showItemBadges: false,
    perforatedEdges: true,
    monochromeImages: true,
  },
}
