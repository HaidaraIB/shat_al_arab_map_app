import type { Plot, PlotStatus, MapData } from '../types/map'
import type { Database } from '../lib/database.types'

export type PlotStateRow = Database['public']['Tables']['plot_state']['Row']

const BOOKING_META_KEYS = ['customerName', 'note', 'reservedAt', 'reservedUntil', 'price', 'employeePrice'] as const

export function stripBookingMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {}
  const next = { ...meta }
  for (const k of BOOKING_META_KEYS) {
    delete next[k]
  }
  return next
}

/** Map document stored in `maps.data` — plots neutral (available, no booking meta). */
export function mapDataForDesignStorage(map: MapData): MapData {
  return {
    ...map,
    plots: map.plots.map((p) => ({
      ...p,
      status: 'available' as PlotStatus,
      meta: stripBookingMeta(p.meta as Record<string, unknown> | undefined),
    })),
  }
}

export function mergePlotStateIntoMap(map: MapData, rows: PlotStateRow[]): MapData {
  const byId = new Map(rows.map((r) => [r.plot_id, r]))
  return {
    ...map,
    plots: map.plots.map((p) => {
      const row = byId.get(p.id)
      if (!row) return p
      const meta = { ...(p.meta ?? {}) } as Record<string, unknown>
      if (row.price != null) meta.price = row.price
      else delete meta.price
      if (row.employee_price != null) meta.employeePrice = row.employee_price
      else delete meta.employeePrice
      if (row.customer_name) meta.customerName = row.customer_name
      else delete meta.customerName
      if (row.note) meta.note = row.note
      else delete meta.note
      if (row.reserved_at) meta.reservedAt = row.reserved_at
      else delete meta.reservedAt
      if (row.reserved_until) meta.reservedUntil = row.reserved_until
      else delete meta.reservedUntil
      return {
        ...p,
        status: row.status as PlotStatus,
        meta: Object.keys(meta).length ? meta : undefined,
      }
    }),
  }
}

export function plotStateRowsFromMap(
  map: MapData,
  mapId: string,
): Omit<PlotStateRow, 'updated_at' | 'updated_by'>[] {
  return map.plots.map((p) => {
    const meta = (p.meta ?? {}) as Record<string, unknown>
    const price = typeof meta.price === 'number' ? meta.price : meta.price != null ? Number(meta.price) : null
    const employeePrice =
      typeof meta.employeePrice === 'number'
        ? meta.employeePrice
        : meta.employeePrice != null
          ? Number(meta.employeePrice)
          : null
    return {
      map_id: mapId,
      plot_id: p.id,
      status: p.status,
      price: Number.isFinite(price as number) ? (price as number) : null,
      employee_price: Number.isFinite(employeePrice as number) ? (employeePrice as number) : null,
      customer_name: typeof meta.customerName === 'string' ? meta.customerName : null,
      note: typeof meta.note === 'string' ? meta.note : null,
      reserved_at: typeof meta.reservedAt === 'string' ? meta.reservedAt : null,
      reserved_until: typeof meta.reservedUntil === 'string' ? meta.reservedUntil : null,
    }
  })
}

export function plotToRemotePatch(
  plot: Plot,
  mapId: string,
): Omit<PlotStateRow, 'updated_at' | 'updated_by'> {
  const meta = (plot.meta ?? {}) as Record<string, unknown>
  const price = typeof meta.price === 'number' ? meta.price : meta.price != null ? Number(meta.price) : null
  const employeePrice =
    typeof meta.employeePrice === 'number'
      ? meta.employeePrice
      : meta.employeePrice != null
        ? Number(meta.employeePrice)
        : null
  return {
    map_id: mapId,
    plot_id: plot.id,
    status: plot.status,
    price: Number.isFinite(price as number) ? (price as number) : null,
    employee_price: Number.isFinite(employeePrice as number) ? (employeePrice as number) : null,
    customer_name: typeof meta.customerName === 'string' ? meta.customerName : null,
    note: typeof meta.note === 'string' ? meta.note : null,
    reserved_at: typeof meta.reservedAt === 'string' ? meta.reservedAt : null,
    reserved_until: typeof meta.reservedUntil === 'string' ? meta.reservedUntil : null,
  }
}
