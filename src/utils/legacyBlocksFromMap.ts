import type { Plot } from '../types/map'
import type { MapData } from '../types/map'
import type { Block, Unit } from '../types'
import { UnitStatus } from '../types'
import { polygonBounds } from './geometry'

export function plotToLegacyUnit(p: Plot): Unit {
  const meta = (p.meta ?? {}) as Record<string, unknown>
  return {
    id: p.id,
    block: p.blockId,
    number: p.number,
    status: p.status as UnitStatus,
    price: typeof meta.price === 'number' ? meta.price : undefined,
    area: typeof meta.area === 'number' ? meta.area : undefined,
    unitType: meta.unitType === 'ركن' ? 'ركن' : 'عادي',
    category: meta.category === 'A' || meta.category === 'B' || meta.category === 'C' ? meta.category : undefined,
    customerName: typeof meta.customerName === 'string' ? meta.customerName : undefined,
    note: typeof meta.note === 'string' ? meta.note : undefined,
    reservedAt: typeof meta.reservedAt === 'string' ? meta.reservedAt : undefined,
    reservedUntil: typeof meta.reservedUntil === 'string' ? meta.reservedUntil : undefined,
  }
}

/** Dashboard `Block[]` derived from vector map data (single source of truth). */
export function legacyBlocksFromMapData(map: MapData): Block[] {
  return map.blocks.map((b) => {
    const bb = polygonBounds(b.polygon)
    const plots = map.plots.filter((p) => p.blockId === b.id)
    const units: Unit[] = plots.map((p) => plotToLegacyUnit(p))
    return {
      id: b.id,
      name: b.label,
      units,
      layout: {
        x: bb.minX,
        y: bb.minY,
        width: Math.max(0, bb.maxX - bb.minX),
        height: Math.max(0, bb.maxY - bb.minY),
        cols: b.cols ?? 1,
        rows: b.rows ?? 1,
      },
    }
  })
}
