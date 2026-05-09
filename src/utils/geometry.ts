import type { Block, Point } from '../types/map'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Pan delta in root SVG space → delta inside the infrastructure group (inverse of region rotate+uniform scale).
 * Region uses translate(cx,cy) rotate(θ) scale(s) translate(-cx,-cy); linear part on vectors is s·R(θ).
 */
export function rootDeltaToInfrastructureDelta(
  dxRoot: number,
  dyRoot: number,
  rotationDeg: number,
  uniformScale: number,
): Point {
  const θ = (rotationDeg * Math.PI) / 180
  const c = Math.cos(θ)
  const s = Math.sin(θ)
  const inv = 1 / (uniformScale || 1)
  return {
    x: inv * (c * dxRoot + s * dyRoot),
    y: inv * (-s * dxRoot + c * dyRoot),
  }
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}

/** Polygon centroid (works for non-self-intersecting polygons). */
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0] }

  let twice = 0
  let cx = 0
  let cy = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const cross = points[i].x * points[j].y - points[j].x * points[i].y
    twice += cross
    cx += (points[i].x + points[j].x) * cross
    cy += (points[i].y + points[j].y) * cross
  }
  if (Math.abs(twice) < 1e-9) {
    let sx = 0
    let sy = 0
    for (const p of points) {
      sx += p.x
      sy += p.y
    }
    return { x: sx / n, y: sy / n }
  }
  const area = twice / 2
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

export function polygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

/** Axis-aligned rect enclosing points (roads, polylines). */
export function pointsBoundingBox(points: Point[], pad = 0): { x: number; y: number; width: number; height: number } {
  const b = polygonBounds(points)
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  return {
    x: b.minX - pad,
    y: b.minY - pad,
    width: b.maxX - b.minX + 2 * pad,
    height: b.maxY - b.minY + 2 * pad,
  }
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    sum += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(sum) / 2
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  const x = point.x
  const y = point.y
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function nearestVertex(point: Point, polygon: Point[]): { index: number; dist: number } {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const d = distance(point, polygon[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return { index: best, dist: bestD }
}

/** Snap point to grid (future snapping guides). */
export function snapToGrid(p: Point, gridSize: number): Point {
  if (gridSize <= 0) return p
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  }
}

export function translatePolygon(poly: Point[], dx: number, dy: number): Point[] {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function rotateAround(p: Point, center: Point, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

/**
 * Resize a grid-aligned quadrilateral (p0 TL, p1 TR, p2 BR, p3 BL for axis-aligned rects)
 * when block rows/cols change; preserves origin p0 and column/row step vectors.
 */
export function resizeGridQuad(polygon: Point[], oldRows: number, oldCols: number, newRows: number, newCols: number): Point[] | null {
  if (polygon.length !== 4) return null
  const [p0, p1, p2, p3] = polygon
  const or = Math.max(1, Math.floor(oldRows))
  const oc = Math.max(1, Math.floor(oldCols))
  const nr = Math.max(1, Math.floor(newRows))
  const nc = Math.max(1, Math.floor(newCols))
  const ux = (p1.x - p0.x) / oc
  const uy = (p1.y - p0.y) / oc
  const vx = (p3.x - p0.x) / or
  const vy = (p3.y - p0.y) / or
  return [
    { x: p0.x, y: p0.y },
    { x: p0.x + ux * nc, y: p0.y + uy * nc },
    { x: p0.x + ux * nc + vx * nr, y: p0.y + uy * nc + vy * nr },
    { x: p0.x + vx * nr, y: p0.y + vy * nr },
  ]
}

/**
 * Corners of one grid cell on a 4-point quadrilateral (same convention as `resizeGridQuad`: p0 TL, p1 TR, p2 BR, p3 BL).
 */
export function plotCellPolygonFromGridQuad(
  polygon: Point[],
  rows: number,
  cols: number,
  row: number,
  col: number,
): Point[] | null {
  if (polygon.length !== 4) return null
  const R = Math.max(1, Math.floor(rows))
  const C = Math.max(1, Math.floor(cols))
  const r = clamp(Math.floor(row), 0, R - 1)
  const c = clamp(Math.floor(col), 0, C - 1)
  const [p0, p1, , p3] = polygon
  const ux = { x: (p1.x - p0.x) / C, y: (p1.y - p0.y) / C }
  const vx = { x: (p3.x - p0.x) / R, y: (p3.y - p0.y) / R }
  const tl = { x: p0.x + ux.x * c + vx.x * r, y: p0.y + ux.y * c + vx.y * r }
  const tr = { x: p0.x + ux.x * (c + 1) + vx.x * r, y: p0.y + ux.y * (c + 1) + vx.y * r }
  const br = {
    x: p0.x + ux.x * (c + 1) + vx.x * (r + 1),
    y: p0.y + ux.y * (c + 1) + vx.y * (r + 1),
  }
  const bl = { x: p0.x + ux.x * c + vx.x * (r + 1), y: p0.y + ux.y * c + vx.y * (r + 1) }
  return [tl, tr, br, bl]
}

/** Closest cell by centroid distance — for plots missing meta.row/col on skewed blocks. */
export function nearestGridCellIndex(
  quad: Point[],
  rows: number,
  cols: number,
  point: Point,
): { row: number; col: number } {
  const R = Math.max(1, Math.floor(rows))
  const C = Math.max(1, Math.floor(cols))
  let bestR = 0
  let bestC = 0
  let bestD = Infinity
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cell = plotCellPolygonFromGridQuad(quad, R, C, r, c)
      if (!cell) continue
      const cc = polygonCentroid(cell)
      const d = distance(point, cc)
      if (d < bestD) {
        bestD = d
        bestR = r
        bestC = c
      }
    }
  }
  return { row: bestR, col: bestC }
}

/**
 * Label strip attached like an extra grid band:
 * - When rows ≥ cols (“vertical” grid): outside the **first row** (along top edge p0→p1).
 * - When cols > rows (“horizontal” grid): outside **column 0** (along left edge p0→p3).
 * Depth is **slightly larger than one unit row/column** (special header band). `stripDepthRatio`
 * (toolbar 22–65%) adds extra thickness on top of that baseline.
 */
export function blockLabelStripLayout(
  block: Block,
  opts?: { /** Extra scale 0.22–0.65 from toolbar; widens/narrows the band around the “~1.12× cell” baseline. */
    stripDepthRatio?: number },
): { corners: Point[]; cx: number; cy: number; stripDepth: number; nx: number; ny: number } | null {
  const ratio = Math.min(0.65, Math.max(0.22, opts?.stripDepthRatio ?? 0.4))
  /** ~1.12× one cell, nudged by slider toward ~1.05×–1.38× */
  const depthScale = 1.08 + ratio * 0.46
  const poly = block.polygon
  if (poly.length !== 4) return null
  const [p0, p1, , p3] = poly
  const R = Math.max(1, block.rows ?? 1)
  const C = Math.max(1, block.cols ?? 1)
  const colStep = { x: (p1.x - p0.x) / C, y: (p1.y - p0.y) / C }
  const rowStep = { x: (p3.x - p0.x) / R, y: (p3.y - p0.y) / R }

  const wideLayout = C > R

  if (!wideLayout) {
    const ex = p1.x - p0.x
    const ey = p1.y - p0.y
    let nx = -ey
    let ny = ex
    const nl = Math.hypot(nx, ny) || 1
    nx /= nl
    ny /= nl
    if (nx * rowStep.x + ny * rowStep.y > 0) {
      nx = -nx
      ny = -ny
    }
    const rowCell = Math.hypot(rowStep.x, rowStep.y)
    const depth = rowCell * depthScale
    const o0 = { x: p0.x + nx * depth, y: p0.y + ny * depth }
    const o1 = { x: p1.x + nx * depth, y: p1.y + ny * depth }
    const corners = [o0, o1, p1, p0]
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4
    return { corners, cx, cy, stripDepth: depth, nx, ny }
  }

  const lx = p3.x - p0.x
  const ly = p3.y - p0.y
  let nx = -ly
  let ny = lx
  const nl = Math.hypot(nx, ny) || 1
  nx /= nl
  ny /= nl
  if (nx * colStep.x + ny * colStep.y > 0) {
    nx = -nx
    ny = -ny
  }
  const colCell = Math.hypot(colStep.x, colStep.y)
  const depth = colCell * depthScale
  const o0 = { x: p0.x + nx * depth, y: p0.y + ny * depth }
  const o3 = { x: p3.x + nx * depth, y: p3.y + ny * depth }
  const corners = [o0, o3, p3, p0]
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4
  return { corners, cx, cy, stripDepth: depth, nx, ny }
}
