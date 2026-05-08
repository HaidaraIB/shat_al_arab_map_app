import React, { memo } from 'react'
import type { Road } from '../../types/map'
import { pointsBoundingBox } from '../../utils/geometry'
import { pointsToSvgPoints } from '../../utils/svg'

type Props = {
  road: Road
  selected?: boolean
}

export const RoadPath = memo(function RoadPath({ road, selected }: Props) {
  const sw = road.strokeWidth ?? 12
  const pts = pointsToSvgPoints(road.points)
  const hitW = Math.max(sw + 20, 32)
  const bb = pointsBoundingBox(road.points, 8)

  return (
    <g>
      <polyline
        points={pts}
        fill="none"
        stroke="transparent"
        strokeWidth={hitW}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        className="map-infra-hit"
      />
      <polyline
        points={pts}
        fill="none"
        stroke="#e4e4e7"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none"
      />
      {selected && (
        <rect
          x={bb.x}
          y={bb.y}
          width={bb.width}
          height={bb.height}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
          rx={3}
          className="pointer-events-none"
        />
      )}
    </g>
  )
})
