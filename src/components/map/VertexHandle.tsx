import React, { memo } from 'react'

type Props = {
  x: number
  y: number
  index: number
  variant?: 'outer' | 'hole'
  onPointerDown: (e: React.PointerEvent, index: number) => void
}

export const VertexHandle = memo(function VertexHandle({
  x,
  y,
  index,
  variant = 'outer',
  onPointerDown,
}: Props) {
  const strokeClass = variant === 'hole' ? 'stroke-amber-600' : 'stroke-blue-600'
  return (
    <circle
      cx={x}
      cy={y}
      r={6}
      className={`map-no-pan cursor-grab fill-white stroke-2 touch-none ${strokeClass}`}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, index)
      }}
    />
  )
})
