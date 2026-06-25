import type { Block as MapBlock, Plot } from '../types/map'
import { polygonBounds, polygonCentroid } from './geometry'

/** Resolve a plot's 0-based row/col inside the block's internal grid. */
export function resolvePlotGridCell(
  plot: Plot,
  block: MapBlock,
): { row: number; col: number } | null {
  const rows = Math.max(1, block.rows ?? 1)
  const cols = Math.max(1, block.cols ?? 1)

  const metaRow = Number(plot.meta?.row)
  const metaCol = Number(plot.meta?.col)
  if (Number.isFinite(metaRow) && Number.isFinite(metaCol)) {
    return {
      row: Math.min(rows - 1, Math.max(0, Math.floor(metaRow))),
      col: Math.min(cols - 1, Math.max(0, Math.floor(metaCol))),
    }
  }

  if (block.polygon.length === 0) return null

  const b = polygonBounds(block.polygon)
  const c = polygonCentroid(plot.polygon)
  const cellW = Math.max(1, (b.maxX - b.minX) / cols)
  const cellH = Math.max(1, (b.maxY - b.minY) / rows)

  return {
    row: Math.min(rows - 1, Math.max(0, Math.floor((c.y - b.minY) / cellH))),
    col: Math.min(cols - 1, Math.max(0, Math.floor((c.x - b.minX) / cellW))),
  }
}

/** True when the plot sits on both a row edge and a column edge of the block grid. */
export function isPlotCornerByGrid(plot: Plot, block: MapBlock | undefined): boolean {
  if (!block) return false

  const cell = resolvePlotGridCell(plot, block)
  if (!cell) return false

  const rows = Math.max(1, block.rows ?? 1)
  const cols = Math.max(1, block.cols ?? 1)
  const onRowEdge = cell.row === 0 || cell.row === rows - 1
  const onColEdge = cell.col === 0 || cell.col === cols - 1

  return onRowEdge && onColEdge
}

export function resolvePlotUnitType(plot: Plot, block: MapBlock | undefined): 'ركن' | 'عادي' {
  return isPlotCornerByGrid(plot, block) ? 'ركن' : 'عادي'
}
