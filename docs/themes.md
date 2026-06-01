# Themes

`@receipt-engine/themes` ships three built-in themes.

| Theme | Mode | Default width | Vibe |
|-------|------|---------------|------|
| `minimal` | `card` | 720 | Clean, white, thin border — general digital receipts. |
| `cute` | `card` | 720 | Soft colors, rounded corners, sparkles & badges — creator booths, doujin events, craft markets. |
| `thermal` | `thermal` | 384 | Black & white, narrow, monospace — mimics thermal paper, no color dependency. |

```ts
import { getTheme, mergeTheme } from '@receipt-engine/themes'

const base = getTheme('cute')
const custom = mergeTheme(base, {
  palette: { primary: '#7048e8', accent: '#b197fc' },
  typography: { fontFamily: "'Baloo 2', sans-serif" },
})
```

## Theme shape

```ts
interface ReceiptTheme {
  name: string
  mode: 'card' | 'thermal'
  palette: {
    background: string
    surface: string
    primary: string
    secondary: string
    text: string
    mutedText: string
    border: string
    accent?: string
  }
  typography: { fontFamily: string; titleSize: number; bodySize: number; smallSize: number }
  radius: { card: number; block: number }
  spacing: { page: number; section: number; row: number }
  decoration?: {
    borderStyle?: 'solid' | 'dashed' | 'none'
    showCornerStars?: boolean
    showItemBadges?: boolean
  }
}
```

## Customizing the brand

The renderers accept either a theme name **or** a full `ReceiptTheme` object:

```ts
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { getTheme, mergeTheme } from '@receipt-engine/themes'

const theme = mergeTheme(getTheme('minimal'), {
  palette: { primary: '#0b7285', accent: '#0b7285' },
})
const svg = renderReceiptToSvg(receipt, { theme, width: 640 })
```

`mergeTheme` shallow-merges each nested group (`palette`, `typography`,
`radius`, `spacing`, `decoration`), so you only specify what changes.

Themes are plain data — community themes are just objects, which is what makes
the v0.4 community theme gallery possible.
