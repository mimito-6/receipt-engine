import { customTheme } from './custom'
import { thermalTheme } from './thermal'
import type { ReceiptTheme, ReceiptThemeName } from './types'

/** All built-in themes, keyed by name. */
export const themes: Record<ReceiptThemeName, ReceiptTheme> = {
  custom: customTheme,
  thermal: thermalTheme,
}

/** Resolve a built-in theme by name. Throws on an unknown name. */
export function getTheme(name: ReceiptThemeName): ReceiptTheme {
  const theme = themes[name]
  if (!theme) {
    throw new Error(
      `Unknown theme: ${String(name)}. Available themes: ${Object.keys(themes).join(', ')}`,
    )
  }
  return theme
}

/** Shallow-merge nested groups of a theme with an optional override. */
export function mergeTheme(base: ReceiptTheme, override?: Partial<ReceiptTheme>): ReceiptTheme {
  if (!override) return base
  return {
    ...base,
    ...override,
    palette: { ...base.palette, ...override.palette },
    typography: { ...base.typography, ...override.typography },
    radius: { ...base.radius, ...override.radius },
    spacing: { ...base.spacing, ...override.spacing },
    decoration: { ...base.decoration, ...override.decoration },
  }
}

export { customTheme, thermalTheme }
export type {
  ReceiptTheme,
  ReceiptThemeName,
  ReceiptThemePalette,
  ReceiptThemeTypography,
  ReceiptThemeRadius,
  ReceiptThemeSpacing,
  ReceiptThemeDecoration,
} from './types'
