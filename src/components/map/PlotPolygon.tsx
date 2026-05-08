import React, { memo } from 'react'
import type { Plot } from '../../types/map'
import { polygonCentroid } from '../../utils/geometry'
import { pointsToSvgPoints } from '../../utils/svg'

const STATUS_FILL: Record<Plot['status'], string> = {
  available: '#86efac',
  reserved: '#fde047',
  sold: '#94a3b8',
}

const STATUS_STROKE: Record<Plot['status'], string> = {
  available: '#166534',
  reserved: '#a16207',
  sold: '#475569',
}

/** Static plot chip — no pointer events (whole-map pan/zoom only). */
export const PlotPolygon = memo(
  function PlotPolygon({
    plot,
    hovered = false,
    selected = false,
    onPointerEnter,
    onPointerLeave,
    onClick,
  }: {
    plot: Plot
    hovered?: boolean
    selected?: boolean
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    onClick?: (e: React.MouseEvent<SVGGElement>) => void
  }) {
    const pts = pointsToSvgPoints(plot.polygon)
    const c = polygonCentroid(plot.polygon)
    const edgeA = plot.polygon[0]
    const edgeB = plot.polygon[1]
    const rawAngle = edgeA && edgeB ? (Math.atan2(edgeB.y - edgeA.y, edgeB.x - edgeA.x) * 180) / Math.PI : 0
    const labelAngle = rawAngle > 90 ? rawAngle - 180 : rawAngle < -90 ? rawAngle + 180 : rawAngle
    const fill = STATUS_FILL[plot.status]
    const stroke = STATUS_STROKE[plot.status]
    const isHot = hovered || selected

    return (
      <g
        className="cursor-pointer"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        <polygon
          points={pts}
          fill={fill}
          fillOpacity={isHot ? 0.96 : 0.85}
          stroke={stroke}
          strokeWidth={isHot ? 1.8 : 1}
          className="transition-all duration-150"
        >
          <title>{`Plot ${plot.number} · ${plot.status}`}</title>
        </polygon>
        {isHot && (
          <polygon
            points={pts}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.2}
            strokeDasharray={selected ? undefined : '5 3'}
            className="pointer-events-none"
          />
        )}
        <text
          x={c.x}
          y={c.y}
          transform={`rotate(${labelAngle} ${c.x} ${c.y})`}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none select-none fill-slate-900 font-bold"
          style={{ fontSize: 9 }}
        >
          {plot.number}
        </text>
      </g>
    )
  },
  (a, b) =>
    a.plot === b.plot &&
    a.hovered === b.hovered &&
    a.selected === b.selected &&
    a.onPointerEnter === b.onPointerEnter &&
    a.onPointerLeave === b.onPointerLeave &&
    a.onClick === b.onClick,
)
