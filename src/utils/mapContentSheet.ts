import type { MapData } from '../types/map'
import { polygonBounds } from './geometry'

/**
 * Dimensions for the zoom layer: covers meta viewport plus real geometry extents and slack
 * for overflow:visible, labels, and componentTransforms so react-zoom-pan-pinch bounds match
 * how far drawings can extend (fixes early clamp on horizontal pan).
 */
export function mapContentSheetSize(map: MapData): { width: number; height: number } {
  const meta = map.meta
  let maxX = 0
  let maxY = 0

  const extendPts = (pts: { x: number; y: number }[], pad: number) => {
    if (pts.length === 0) return
    const b = polygonBounds(pts)
    maxX = Math.max(maxX, b.maxX + pad)
    maxY = Math.max(maxY, b.maxY + pad)
  }

  for (const p of map.plots) extendPts(p.polygon, 12)
  for (const blk of map.blocks) extendPts(blk.polygon, 10)

  for (const r of map.roads)
    extendPts(r.points, Math.max((r.strokeWidth ?? 12) / 2 + 24, 28))

  for (const f of map.facilities) extendPts(f.polygon, 28)

  for (const lbl of map.labels) {
    const halo = lbl.kind === 'block' ? 36 : lbl.kind === 'road' ? 120 : 72
    maxX = Math.max(maxX, lbl.position.x + halo)
    maxY = Math.max(maxY, lbl.position.y + halo)
  }

  maxX = Math.max(maxX, meta.width)
  maxY = Math.max(maxY, meta.height)

  let slackX = 160
  let slackY = 120
  for (const v of Object.values(map.componentTransforms ?? {})) {
    slackX = Math.max(slackX, 200 + Math.abs(v.x))
    slackY = Math.max(slackY, 140 + Math.abs(v.y))
    const sx = Number.isFinite(v.scaleX) ? v.scaleX : v.uniformScale
    const sy = Number.isFinite(v.scaleY) ? v.scaleY : v.uniformScale
    if (Math.abs(v.rotationDeg) > 3 || Math.abs(sx - 1) > 0.05 || Math.abs(sy - 1) > 0.05) {
      slackX += meta.width * 0.06
      slackY += meta.height * 0.06
    }
  }

  return {
    width: Math.ceil(Math.max(meta.width, maxX + slackX)),
    height: Math.ceil(Math.max(meta.height, maxY + slackY)),
  }
}
