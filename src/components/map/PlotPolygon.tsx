import React, { memo } from 'react'
import type { Plot } from '../../types/map'
import { polygonCentroid } from '../../utils/geometry'
import { pointsToSvgPoints } from '../../utils/svg'

const STATUS_FILL: Record<Plot['status'], string> = {
  available: '#86efac',
  reserved: '#fde047',
  sold: '#fecaca',
}

const STATUS_STROKE: Record<Plot['status'], string> = {
  available: '#166534',
  reserved: '#a16207',
  sold: '#b91c1c',
}

/** Static plot chip — no pointer events (whole-map pan/zoom only). */
export const PlotPolygon = memo(
  function PlotPolygon({
    plot,
    hovered = false,
    selected = false,
    /** Cancels non-uniform scale from parent component transform so digits stay round. */
    inverseScaleX = 1,
    inverseScaleY = 1,
    /** View zoom scale — keeps label roughly constant px size while pan-zooming. */
    viewportScale = 1,
    /** Same as block title: counter parent `componentGroupTransform` rotation so digits read like “B2” / “C1”. */
    blockRotationDeg = 0,
    interactive = true,
    onPointerEnter,
    onPointerLeave,
    onClick,
    onDoubleClick,
  }: {
    plot: Plot
    hovered?: boolean
    selected?: boolean
    /** When false, plot is not clickable (e.g. sales view on non-available units). */
    interactive?: boolean
    inverseScaleX?: number
    inverseScaleY?: number
    viewportScale?: number
    blockRotationDeg?: number
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    onClick?: (e: React.MouseEvent<SVGGElement>) => void
    onDoubleClick?: (e: React.MouseEvent<SVGGElement>) => void
  }) {
    const pts = pointsToSvgPoints(plot.polygon)
    const c = polygonCentroid(plot.polygon)
    const counterRot =
      Math.abs(blockRotationDeg) > 0.08
        ? `rotate(${-blockRotationDeg}, ${c.x}, ${c.y})`
        : undefined
    const fill = STATUS_FILL[plot.status]
    const stroke = STATUS_STROKE[plot.status]
    const isHot = hovered || selected
    const vs = Math.max(0.04, viewportScale)
    const sx = Math.max(0.04, inverseScaleX)
    const sy = Math.max(0.04, inverseScaleY)
    const baseFs = plot.labelFontSize ?? 9
    const fontPx = Math.max(5, Math.min(36, baseFs / vs))

    return (
      <g
        className={interactive ? 'cursor-pointer' : 'cursor-default pointer-events-none'}
        onPointerEnter={interactive ? onPointerEnter : undefined}
        onPointerLeave={interactive ? onPointerLeave : undefined}
        onClick={interactive ? onClick : undefined}
        onDoubleClick={interactive ? onDoubleClick : undefined}
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
        <g
          className="pointer-events-none"
          transform={`translate(${c.x}, ${c.y}) scale(${1 / sx}, ${1 / sy}) translate(${-c.x}, ${-c.y})`}
        >
          {counterRot ? (
            <g transform={counterRot}>
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none fill-slate-900 font-bold [text-rendering:geometricPrecision]"
                style={{ fontSize: fontPx }}
              >
                {plot.number}
              </text>
            </g>
          ) : (
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="pointer-events-none select-none fill-slate-900 font-bold [text-rendering:geometricPrecision]"
              style={{ fontSize: fontPx }}
            >
              {plot.number}
            </text>
          )}
        </g>
      </g>
    )
  },
  (a, b) =>
    a.plot === b.plot &&
    a.hovered === b.hovered &&
    a.selected === b.selected &&
    a.interactive === b.interactive &&
    a.inverseScaleX === b.inverseScaleX &&
    a.inverseScaleY === b.inverseScaleY &&
    a.viewportScale === b.viewportScale &&
    a.blockRotationDeg === b.blockRotationDeg &&
    a.onPointerEnter === b.onPointerEnter &&
    a.onPointerLeave === b.onPointerLeave &&
    a.onClick === b.onClick &&
    a.onDoubleClick === b.onDoubleClick,
)
