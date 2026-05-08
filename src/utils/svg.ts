import type { ComponentTransform, MapRegionTransform, Point } from '../types/map'

export function pointsToSvgPoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

export function pointsToSvgPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return ''
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  return closed ? `${d} Z` : d
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
