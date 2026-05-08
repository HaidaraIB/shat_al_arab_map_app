import React, { memo } from 'react'

type Props = {
  x: number
  y: number
  index: number
  onPointerDown: (e: React.PointerEvent, index: number) => void
}

export const VertexHandle = memo(function VertexHandle({ x, y, index, onPointerDown }: Props) {
  return (
    <circle
      cx={x}
      cy={y}
      r={6}
      className="map-no-pan cursor-grab fill-white stroke-blue-600 stroke-2 touch-none"
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, index)
      }}
    />
  )
})
