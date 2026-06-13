import type { ComponentTransform, MapRegionTransform, Point } from '../types/map'

export function pointsToSvgPoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

export function pointsToSvgPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return ''
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  return closed ? `${d} Z` : d
}

/** Closed outer ring plus optional hole rings for SVG `fill-rule="evenodd"`. */
export function polygonWithHolesToSvgPath(outer: Point[], holes: Point[][] = []): string {
  const parts = [pointsToSvgPath(outer, true)]
  for (const hole of holes) {
    if (hole.length >= 3) parts.push(pointsToSvgPath(hole, true))
  }
  return parts.join(' ')
}

export function isNearPoint(a: Point, b: Point, threshold = 8): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy <= threshold * threshold
}

/** Inverse of `componentGroupTransform` pivot — map/SVG point → component-local point. */
export function componentLocalFromSvgPoint(
  world: Point,
  pivot: Point,
  t: ComponentTransform,
): Point {
  const { sx, sy } = resolvedComponentScale(t)
  const rad = (-t.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = world.x - t.x - pivot.x
  const dy = world.y - t.y - pivot.y
  const ux = dx / sx
  const uy = dy / sy
  return {
    x: ux * cos - uy * sin + pivot.x,
    y: ux * sin + uy * cos + pivot.y,
  }
}

/** Screen pixel → SVG user coordinates (call on the root &lt;svg&gt; element). */
export function screenToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const inv = ctm.inverse()
  const p = pt.matrixTransform(inv)
  return { x: p.x, y: p.y }
}

/** Effective scale factors used by `componentGroupTransform` (clamped for safe inverses). */
export function resolvedComponentScale(t: ComponentTransform): { sx: number; sy: number } {
  return {
    sx: Math.max(0.04, Number.isFinite(t.scaleX) ? t.scaleX : t.uniformScale ?? 1),
    sy: Math.max(0.04, Number.isFinite(t.scaleY) ? t.scaleY : t.uniformScale ?? 1),
  }
}

/**
 * SVG group transform that undoes non-uniform scale from the parent `componentGroupTransform`,
 * keeping text glyph aspect ratio; anchor at `(px, py)` should match the label position.
 */
export function undoComponentScaleAt(px: number, py: number, sx: number, sy: number): string {
  const ix = 1 / Math.max(0.04, sx)
  const iy = 1 / Math.max(0.04, sy)
  return `translate(${px}, ${py}) scale(${ix}, ${iy}) translate(${-px}, ${-py})`
}

/** Local pivot rotate + non-uniform scale + translate (after translate x,y). */
export function componentGroupTransform(cx: number, cy: number, t: ComponentTransform): string {
  const sx = Number.isFinite(t.scaleX) ? t.scaleX : t.uniformScale
  const sy = Number.isFinite(t.scaleY) ? t.scaleY : t.uniformScale
  return `translate(${t.x}, ${t.y}) translate(${cx}, ${cy}) rotate(${t.rotationDeg}) scale(${sx}, ${sy}) translate(${-cx}, ${-cy})`
}

/** @deprecated */
export function regionGroupTransform(
  metaWidth: number,
  metaHeight: number,
  r: MapRegionTransform,
): string {
  const cx = metaWidth / 2
  const cy = metaHeight / 2
  return `translate(${r.offsetX}, ${r.offsetY}) translate(${cx}, ${cy}) rotate(${r.rotationDeg}) scale(${r.uniformScale}) translate(${-cx}, ${-cy})`
}
