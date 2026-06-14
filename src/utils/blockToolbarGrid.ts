import type { Block } from '../types/map'

/** C-series blocks use master-plan row/column naming transposed vs stored rows/cols. */
export function isCBlock(blockId: string): boolean {
  return /^C\d+$/.test(blockId)
}

/** Grid size shown in toolbar (صف × عمود) — matches master-plan strips for C blocks. */
export function toolbarGridDimensions(block: Block): { rows: number; cols: number } {
  const r = Math.max(1, block.rows ?? 1)
  const c = Math.max(1, block.cols ?? 1)
  if (isCBlock(block.id)) return { rows: c, cols: r }
  return { rows: r, cols: c }
}

/** Inverse of `toolbarGridDimensions`: toolbar صف/عمود → stored rows/cols. */
export function toolbarGridToInternal(
  block: Block,
  toolbarRows: number,
  toolbarCols: number,
): { rows: number; cols: number } {
  const tr = Math.max(1, Math.floor(toolbarRows))
  const tc = Math.max(1, Math.floor(toolbarCols))
  if (isCBlock(block.id)) return { rows: tc, cols: tr }
  return { rows: tr, cols: tc }
}

/**
 * Map toolbar row/col (1-based) to internal storage indices (0-based).
 * For C blocks: display “row” indexes along the long strip → internal col;
 * display “col” picks one of the two strips → internal row.
 */
export function toolbarCellToInternal(
  block: Block,
  toolbarRow1: number,
  toolbarCol1: number,
): { row: number; col: number } {
  const tr = Math.max(1, Math.floor(toolbarRow1))
  const tc = Math.max(1, Math.floor(toolbarCol1))
  if (isCBlock(block.id)) {
    return { row: tc - 1, col: tr - 1 }
  }
  return { row: tr - 1, col: tc - 1 }
}

/** Map toolbar 1-based internal grid-line indices to internal storage line indices (0..rows, 0..cols). */
export function toolbarGridLineToInternal(
  block: Block,
  toolbarRowLine: number,
  toolbarColLine: number,
): { rowLine: number; colLine: number } {
  const tr = Math.max(1, Math.floor(toolbarRowLine))
  const tc = Math.max(1, Math.floor(toolbarColLine))
  if (isCBlock(block.id)) {
    return { rowLine: tc, colLine: tr }
  }
  return { rowLine: tr, colLine: tc }
}

/** Valid internal grid-line range for toolbar row/col sliders (1 .. dim − 1). */
export function toolbarInternalGridLineRange(dim: number): { min: number; max: number } {
  const d = Math.max(1, Math.floor(dim))
  if (d <= 1) return { min: 1, max: 1 }
  return { min: 1, max: d - 1 }
}

/** Default toolbar grid-line indices when switching to intersection mode. */
export function defaultToolbarGridIntersectionLines(block: Block): {
  rowLine: number
  colLine: number
} {
  const { rows, cols } = toolbarGridDimensions(block)
  const rowRange = toolbarInternalGridLineRange(rows)
  const colRange = toolbarInternalGridLineRange(cols)
  return {
    rowLine: Math.max(rowRange.min, Math.min(rowRange.max, Math.ceil(rows / 2))),
    colLine: colRange.min,
  }
}
