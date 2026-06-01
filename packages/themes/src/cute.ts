import type { ReceiptTheme } from './types'

/** Soft, rounded, playful — like a little keepsake card for creator booths. */
export const cuteTheme: ReceiptTheme = {
  name: 'cute',
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
    fontFamily:
      "'Quicksand', 'Baloo 2', 'Nunito', 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    titleSize: 32,
    bodySize: 16,
    smallSize: 12,
  },
  radius: { card: 28, block: 16 },
  spacing: { page: 34, section: 22, row: 14 },
  decoration: { borderStyle: 'dashed', showCornerStars: true, showItemBadges: true },
}
