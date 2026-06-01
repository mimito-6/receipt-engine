export type ReceiptThemeName = 'minimal' | 'cute' | 'thermal'

export interface ReceiptThemePalette {
  background: string
  surface: string
  primary: string
  secondary: string
  text: string
  mutedText: string
  border: string
  accent?: string
}

export interface ReceiptThemeTypography {
  fontFamily: string
  titleSize: number
  bodySize: number
  smallSize: number
}

export interface ReceiptThemeRadius {
  card: number
  block: number
}

export interface ReceiptThemeSpacing {
  page: number
  section: number
  row: number
}

export interface ReceiptThemeDecoration {
  borderStyle?: 'solid' | 'dashed' | 'none'
  showCornerStars?: boolean
  showItemBadges?: boolean
}

export interface ReceiptTheme {
  name: string
  mode: 'card' | 'thermal'
  palette: ReceiptThemePalette
  typography: ReceiptThemeTypography
  radius: ReceiptThemeRadius
  spacing: ReceiptThemeSpacing
  decoration?: ReceiptThemeDecoration
}
