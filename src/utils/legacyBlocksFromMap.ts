import type { Block as MapBlock, Plot } from '../types/map'
import type { MapData } from '../types/map'
import type { Block, Unit } from '../types'
import { UnitStatus } from '../types'
import { polygonBounds } from './geometry'
import { toolbarGridDimensions } from './blockToolbarGrid'

type CategoryPricingConfig = {
  basePrice: number
  baseEmployeePrice: number
  baseArea: number
  cornerPremium: number
  cornerAreaBonus: number
}

function parseMetaNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function categoryDefaults(
  cfg: CategoryPricingConfig,
  isCorner: boolean,
): { price: number; employeePrice: number; area: number } {
  const cornerMul = 1 + cfg.cornerPremium / 100
  return {
    price: isCorner ? cfg.basePrice * cornerMul : cfg.basePrice,
    employeePrice: isCorner ? cfg.baseEmployeePrice * cornerMul : cfg.baseEmployeePrice,
    area: isCorner ? cfg.baseArea + cfg.cornerAreaBonus : cfg.baseArea,
  }
}

/** Fills missing price/area from category rules without overwriting plot-specific values. */
export function enrichMapDataFromCategoryConfigs(
  map: MapData,
  configs: Record<'A' | 'B' | 'C', CategoryPricingConfig>,
): MapData {
  return {
    ...map,
    plots: map.plots.map((plot) => {
      const mapBlock = map.blocks.find((b) => b.id === plot.blockId)
      const blockDisplay = effectiveBlockLabel(map, plot.blockId)
      const cat = resolvePlotCategory(plot, mapBlock, blockDisplay)
      if (!cat || !configs[cat]) return plot

      const meta = { ...(plot.meta ?? {}) } as Record<string, unknown>
      const isCorner = meta.unitType === 'ركن'
      const defaults = categoryDefaults(configs[cat], isCorner)
      const price = parseMetaNum(meta.price)
      const employeePrice = parseMetaNum(meta.employeePrice)
      const area = parseMetaNum(meta.area)

      return {
        ...plot,
        meta: {
          ...meta,
          category: meta.category ?? cat,
          price: price ?? defaults.price,
          employeePrice: employeePrice ?? defaults.employeePrice,
          area: area ?? defaults.area,
        },
      }
    }),
  }
}

/** Applies category rules to every matching plot (used when saving settings). */
export function applyCategoryConfigsToMap(
  map: MapData,
  configs: Record<'A' | 'B' | 'C', CategoryPricingConfig>,
): MapData {
  return {
    ...map,
    plots: map.plots.map((plot) => {
      const mapBlock = map.blocks.find((b) => b.id === plot.blockId)
      const blockDisplay = effectiveBlockLabel(map, plot.blockId)
      const cat = resolvePlotCategory(plot, mapBlock, blockDisplay)
      if (!cat || !configs[cat]) return plot

      const meta = { ...(plot.meta ?? {}) } as Record<string, unknown>
      const isCorner = meta.unitType === 'ركن'
      const defaults = categoryDefaults(configs[cat], isCorner)

      return {
        ...plot,
        meta: {
          ...meta,
          category: meta.category ?? cat,
          price: defaults.price,
          employeePrice: defaults.employeePrice,
          area: defaults.area,
        },
      }
    }),
  }
}

/** Block title as shown on the map: marker label wins, then persisted `block.label`. */
export function effectiveBlockLabel(map: MapData, blockId: string): string {
  const b = map.blocks.find((x) => x.id === blockId)
  const marker = map.labels.find((l) => l.id === `blk-marker-${blockId}`)
  const fromMarker = marker?.text?.trim()
  if (fromMarker) return fromMarker
  if (b) return (b.label || b.id).trim()
  if (blockId === 'custom') return 'مخصص'
  return blockId
}

function firstLatinClassificationLetter(label: string): 'A' | 'B' | 'C' | undefined {
  const m = label.trim().match(/^([A-Za-z])/)
  if (!m) return undefined
  const L = m[1]!.toUpperCase()
  return L === 'A' || L === 'B' || L === 'C' ? L : undefined
}

function normalizeExplicitClassification(raw: string | undefined): 'A' | 'B' | 'C' | undefined {
  if (!raw?.trim()) return undefined
  const t = raw.trim().toUpperCase()
  return t === 'A' || t === 'B' || t === 'C' ? t : undefined
}

/** Category when inserting a new plot: same rules as existing plots, with empty meta. */
export function categoryForNewPlotInBlock(
  map: MapData,
  mapBlock: MapBlock,
  blockId: string,
): 'A' | 'B' | 'C' | undefined {
  const display = effectiveBlockLabel(map, blockId)
  return resolvePlotCategory({ meta: {} } as Plot, mapBlock, display)
}

/** Category for dashboard + detail panel: block-level first, then plot meta. */
export function resolvePlotCategory(
  plot: Plot,
  mapBlock: MapBlock | undefined,
  blockDisplayLabel: string,
): 'A' | 'B' | 'C' | undefined {
  const explicit = normalizeExplicitClassification(mapBlock?.classification)
  if (explicit) return explicit

  const fromTitle = firstLatinClassificationLetter(blockDisplayLabel)
  if (fromTitle) return fromTitle

  const meta = (plot.meta ?? {}) as Record<string, unknown>
  const c = meta.category
  if (c === 'A' || c === 'B' || c === 'C') return c

  return undefined
}

/** Matches on-map label + block title, e.g. "A6-23" for block A6 and unit text "23". */
export function formatPropertyCode(map: MapData, plot: Plot): string {
  const num = (plot.number ?? '').trim()
  const mapBlock = map.blocks.find((b) => b.id === plot.blockId)
  if (!mapBlock) {
    return num || plot.id
  }
  const blockTitle = effectiveBlockLabel(map, plot.blockId)
  if (!num) return blockTitle
  return `${blockTitle}-${num}`
}

export function plotToLegacyUnit(plot: Plot, map: MapData, mapBlock: MapBlock | undefined): Unit {
  const meta = (plot.meta ?? {}) as Record<string, unknown>
  const blockDisplay = effectiveBlockLabel(map, plot.blockId)
  const category = resolvePlotCategory(plot, mapBlock, blockDisplay)

  return {
    id: plot.id,
    block: blockDisplay,
    propertyCode: formatPropertyCode(map, plot),
    number: plot.number,
    status: plot.status as UnitStatus,
    price: typeof meta.price === 'number' ? meta.price : undefined,
    employeePrice: typeof meta.employeePrice === 'number' ? meta.employeePrice : undefined,
    area: typeof meta.area === 'number' ? meta.area : undefined,
    unitType: meta.unitType === 'ركن' ? 'ركن' : 'عادي',
    category,
    customerName: typeof meta.customerName === 'string' ? meta.customerName : undefined,
    note: typeof meta.note === 'string' ? meta.note : undefined,
    reservedAt: typeof meta.reservedAt === 'string' ? meta.reservedAt : undefined,
    reservedUntil: typeof meta.reservedUntil === 'string' ? meta.reservedUntil : undefined,
  }
}

function boundsOfPlots(plots: Plot[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of plots) {
    const bb = polygonBounds(p.polygon)
    minX = Math.min(minX, bb.minX)
    minY = Math.min(minY, bb.minY)
    maxX = Math.max(maxX, bb.maxX)
    maxY = Math.max(maxY, bb.maxY)
  }
  return { minX, minY, maxX, maxY }
}

/** Dashboard `Block[]` derived from vector map data (single source of truth). */
export function legacyBlocksFromMapData(map: MapData): Block[] {
  const registeredIds = new Set(map.blocks.map((b) => b.id))

  const fromRegistered = map.blocks.map((b) => {
    const bb = polygonBounds(b.polygon)
    const plots = map.plots.filter((p) => p.blockId === b.id)
    const units: Unit[] = plots.map((p) => plotToLegacyUnit(p, map, b))
    const tg = toolbarGridDimensions(b)
    return {
      id: b.id,
      name: effectiveBlockLabel(map, b.id),
      units,
      layout: {
        x: bb.minX,
        y: bb.minY,
        width: Math.max(0, bb.maxX - bb.minX),
        height: Math.max(0, bb.maxY - bb.minY),
        cols: tg.cols,
        rows: tg.rows,
      },
    }
  })

  const orphanPlots = map.plots.filter((p) => !registeredIds.has(p.blockId))
  if (orphanPlots.length === 0) return fromRegistered

  const bb = boundsOfPlots(orphanPlots)
  return [
    ...fromRegistered,
    {
      id: '__orphan__',
      name: 'وحدات خارج الكتل',
      units: orphanPlots.map((p) => plotToLegacyUnit(p, map, undefined)),
      layout: {
        x: bb.minX,
        y: bb.minY,
        width: Math.max(0, bb.maxX - bb.minX),
        height: Math.max(0, bb.maxY - bb.minY),
        cols: 1,
        rows: 1,
      },
    },
  ]
}
