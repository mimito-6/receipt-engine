import type { ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToSvg, type RenderSvgOptions } from '@receipt-engine/render-svg'
import * as React from 'react'

export interface ReceiptCardProps {
  receipt: ReceiptDocument
  theme?: RenderSvgOptions['theme']
  width?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Render a receipt as an inline SVG card.
 *
 * The SVG is produced by `renderReceiptToSvg`, which validates the document
 * and escapes every piece of user text, so injecting it via
 * `dangerouslySetInnerHTML` is safe.
 */
export function ReceiptCard({
  receipt,
  theme,
  width,
  className,
  style,
}: ReceiptCardProps): React.ReactElement {
  const svg = React.useMemo(
    () => renderReceiptToSvg(receipt, { theme, width }),
    [receipt, theme, width],
  )

  return (
    <div
      className={className}
      style={{ display: 'inline-block', lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
