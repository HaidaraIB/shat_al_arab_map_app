import React, { memo } from 'react'
import type { MapLabel as MapLabelType } from '../../types/map'

type Props = {
  label: MapLabelType
  className?: string
}

/** SVG text label with optional rotation (degrees). */
export const Label = memo(function Label({ label, className }: Props) {
  const { position, text, rotation = 0, fontSize = 10, fontWeight = '600' } = label
  return (
    <text
      x={position.x}
      y={position.y}
      transform={rotation ? `rotate(${rotation}, ${position.x}, ${position.y})` : undefined}
      textAnchor="middle"
      dominantBaseline="central"
      className={className ?? 'pointer-events-none select-none fill-slate-900'}
      style={{ fontSize, fontWeight }}
    >
      {text}
    </text>
  )
})
