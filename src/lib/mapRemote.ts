import type { RealtimeChannel } from '@supabase/supabase-js'
import type { MapData, Plot } from '../types/map'
import type { MapZoneId } from '../config/zones'
import { getZoneConfig } from '../config/zones'
import { publicMapUrlForFile } from '../config/publicMap'
import { getSupabase } from './supabase'
import {
  mapDataForDesignStorage,
  mergePlotStateIntoMap,
  plotStateRowsFromMap,
  plotToRemotePatch,
  type PlotStateRow,
} from '../utils/mapSupabaseSync'

let plotChannel: RealtimeChannel | null = null
let previewMode = false

export function setPlotRealtimePreviewMode(on: boolean) {
  previewMode = on
}

export function getPlotRealtimePreviewMode(): boolean {
  return previewMode
}

function cloneMap(m: MapData): MapData {
  return JSON.parse(JSON.stringify(m)) as MapData
}

export async function fetchRemoteMapBundle(mapId: MapZoneId): Promise<{
  design: MapData | null
  plotStates: PlotStateRow[]
  error: string | null
}> {
  const supabase = getSupabase()
  if (!supabase) return { design: null, plotStates: [], error: null }

  const { data: mapRow, error: mapErr } = await supabase.from('maps').select('data').eq('id', mapId).maybeSingle()

  if (mapErr) return { design: null, plotStates: [], error: mapErr.message }

  const { data: states, error: psErr } = await supabase.from('plot_state').select('*').eq('map_id', mapId)

  if (psErr) return { design: null, plotStates: [], error: psErr.message }

  const design = mapRow?.data ? (mapRow.data as unknown as MapData) : null
  return {
    design,
    plotStates: (states ?? []) as PlotStateRow[],
    error: null,
  }
}

export function mergeDesignAndPlotStates(design: MapData, plotStates: PlotStateRow[]): MapData {
  return mergePlotStateIntoMap(cloneMap(design), plotStates)
}

export async function publishDesignRemote(map: MapData, mapId: MapZoneId): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Cloud backend is not configured' }
  const payload = mapDataForDesignStorage(map)
  const { error } = await supabase.from('maps').upsert({
    id: mapId,
    name: mapId,
    data: payload as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
  return { error: error?.message ?? null }
}

export async function reseedPlotStateRemote(map: MapData, mapId: MapZoneId): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Cloud backend is not configured' }
  const rows = plotStateRowsFromMap(map, mapId)
  const { error } = await supabase.from('plot_state').upsert(rows, { onConflict: 'map_id,plot_id' })
  return { error: error?.message ?? null }
}

export async function upsertPlotStateFromPlot(plot: Plot, mapId: MapZoneId): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Cloud backend is not configured' }
  const row = plotToRemotePatch(plot, mapId)
  const { error } = await supabase.from('plot_state').upsert(row, { onConflict: 'map_id,plot_id' })
  return { error: error?.message ?? null }
}

export function subscribePlotStateRealtime(
  onRow: (row: PlotStateRow) => void,
  mapId: MapZoneId,
): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  if (plotChannel) {
    void supabase.removeChannel(plotChannel)
    plotChannel = null
  }

  plotChannel = supabase
    .channel(`plot_state_changes_${mapId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'plot_state' },
      (payload) => {
        if (previewMode) return
        const row = payload.new as PlotStateRow | undefined
        if (row && typeof row.plot_id === 'string' && row.map_id === mapId) {
          onRow(row)
        }
      },
    )
    .subscribe()

  return () => {
    if (plotChannel && supabase) {
      void supabase.removeChannel(plotChannel)
      plotChannel = null
    }
  }
}

export async function fetchSeedMapFromPublic(mapId: MapZoneId): Promise<MapData | null> {
  const zone = getZoneConfig(mapId)
  try {
    const res = await fetch(publicMapUrlForFile(zone.publicFile), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as MapData
  } catch {
    return null
  }
}
