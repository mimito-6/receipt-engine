import type { ReceiptTheme } from './types'

/**
 * The default, fully customizable card theme: soft colors, rounded corners,
 * sparkles, item badges. Change colors / fonts via `mergeTheme`, and add
 * stickers on the receipt document. This is what users tweak to make it theirs.
 */
export const customTheme: ReceiptTheme = {
  name: 'custom',
  mode: 'card',
  palette: {
    background: '#fff0f6',
    surface: '#fffdfb',
    primary: '#d6336c',
    secondary: '#f06595',
    text: '#5b3256',
    mutedText: '#a4799b',
    border: '#ffd6e7',
    accent: '#ff8cc6',
  },
  typography: {
    // Latin (Quicksand) + matched CJK (Noto Sans TC) before any system font, so
    // Latin and CJK glyphs look like one typeface instead of two.
    fontFamily: "'Quicksand','Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    titleSize: 32,
    bodySize: 16,
    smallSize: 12,
  },
  radius: { card: 28, block: 16 },
  spacing: { page: 34, section: 22, row: 14 },
  decoration: {
    borderStyle: 'dashed',
    // Off by default: corner sparkles read like uneditable stickers. The
    // playground exposes a toggle; users who want them opt in.
    showCornerStars: false,
    showItemBadges: true,
    perforatedEdges: false,
    monochromeImages: false,
  },
}
