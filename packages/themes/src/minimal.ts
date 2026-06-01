import type { ReceiptTheme } from './types'

/** Clean, white, thin-bordered — a calm general-purpose digital receipt. */
export const minimalTheme: ReceiptTheme = {
  name: 'minimal',
  mode: 'card',
  palette: {
    background: '#f4f4f5',
    surface: '#ffffff',
    primary: '#18181b',
    secondary: '#52525b',
    text: '#18181b',
    mutedText: '#71717a',
    border: '#e4e4e7',
    accent: '#3b82f6',
  },
  typography: {
    fontFamily:
      "'Inter', 'Helvetica Neue', 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    titleSize: 30,
    bodySize: 15,
    smallSize: 12,
  },
  radius: { card: 16, block: 8 },
  spacing: { page: 32, section: 20, row: 12 },
  decoration: { borderStyle: 'solid', showCornerStars: false, showItemBadges: true },
}
