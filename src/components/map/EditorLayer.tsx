import React, { memo, useCallback } from 'react'
import type { DrawingState, Plot } from '../../types/map'
import { pointsToSvgPoints } from '../../utils/svg'
import { VertexHandle } from './VertexHandle'

type Props = {
  editMode: boolean
  selectedPlot: Plot | null
  drawing: DrawingState
  onVertexPointerDown: (e: React.PointerEvent, plotId: string, vertexIndex: number) => void
}

export const EditorLayer = memo(function EditorLayer({
  editMode,
  selectedPlot,
  drawing,
  onVertexPointerDown,
}: Props) {
  const renderHandles = useCallback(() => {
    if (!editMode || !selectedPlot) return null
    return selectedPlot.polygon.map((p, i) => (
      <VertexHandle
        key={`${selectedPlot.id}-v-${i}`}
        x={p.x}
        y={p.y}
        index={i}
        onPointerDown={(e, idx) => onVertexPointerDown(e, selectedPlot.id, idx)}
      />
    ))
  }, [editMode, selectedPlot, onVertexPointerDown])

  const previewPts =
    drawing.mode === 'plot' && drawing.points.length > 0 ? pointsToSvgPoints(drawing.points) : ''
  const roadPts =
    drawing.mode === 'road' && drawing.points.length > 0 ? pointsToSvgPoints(drawing.points) : ''

  return (
    <g className="pointer-events-auto">
      {drawing.mode === 'plot' && previewPts && (
        <>
          <polyline
            points={previewPts}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="pointer-events-none"
          />
          {drawing.points.map((p, i) => (
            <circle key={`dr-p-${i}`} cx={p.x} cy={p.y} r={4} className="fill-blue-500 pointer-events-none" />
          ))}
        </>
      )}
      {drawing.mode === 'road' && roadPts && (
        <polyline
          points={roadPts}
          fill="none"
          stroke="#71717a"
          strokeWidth={3}
          strokeDasharray="4 3"
          className="pointer-events-none"
        />
      )}
      {renderHandles()}
    </g>
  )
})
