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
