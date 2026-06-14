import { create } from 'zustand'
import type {
  Block as MapBlock,
  ComponentTransform,
  DrawingState,
  EditorTool,
  Facility,
  MapData,
  MapLabel,
  MapLayerVisibility,
  Plot,
  PlotStatus,
  Point,
  Road,
} from '../types/map'
import { defaultComponentTransform } from '../types/map'
import type { Block as LegacyBlock } from '../types'
import { UnitStatus } from '../types'
import {
  nearestGridCellIndex,
  plotCellPolygonFromGridQuad,
  polygonCentroid,
  resizeGridQuad,
  snapToGrid,
  translatePolygon,
} from '../utils/geometry'
import { publicInitialMapUrl } from '../config/publicMap'
import type { MapZoneId } from '../config/zones'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchRemoteMapBundle,
  fetchSeedMapFromPublic,
  getPlotRealtimePreviewMode,
  mergeDesignAndPlotStates,
  publishDesignRemote,
  reseedPlotStateRemote,
  setPlotRealtimePreviewMode,
  subscribePlotStateRealtime,
} from '../lib/mapRemote'
import type { PlotStateRow } from '../utils/mapSupabaseSync'
import { mergePlotStateIntoMap, stripBookingMeta } from '../utils/mapSupabaseSync'

/** After grid resize, recompute each plot polygon so cell size matches the block quad (fixes stretched/misaligned units). */
function remapPlotsToBlockGrid(plots: Plot[], blockId: string, quad: Point[], rows: number, cols: number): Plot[] {
  const R = Math.max(1, rows)
  const C = Math.max(1, cols)
  return plots.map((p) => {
    if (p.blockId !== blockId) return p
    let r: number
    let c: number
    const mr = Number(p.meta?.row)
    const mc = Number(p.meta?.col)
    if (Number.isFinite(mr) && Number.isFinite(mc)) {
      r = Math.min(R - 1, Math.max(0, Math.floor(mr)))
      c = Math.min(C - 1, Math.max(0, Math.floor(mc)))
    } else {
      const q = nearestGridCellIndex(quad, R, C, polygonCentroid(p.polygon))
      r = q.row
      c = q.col
    }
    const cell = plotCellPolygonFromGridQuad(quad, R, C, r, c)
    if (!cell) return p
    return { ...p, polygon: cell, meta: { ...(p.meta ?? {}), row: r, col: c } }
  })
}

const LEGACY_DEFAULT_STORAGE_KEY = 'shat_al_arab_map_default_design_v1'
const LEGACY_WORKING_STORAGE_KEY = 'shat_al_arab_map_working_design_v1'

function mapWorkingStorageKey(mapId: MapZoneId): string {
  return `shat_al_arab_map_${mapId}_working_v1`
}

function mapDefaultStorageKey(mapId: MapZoneId): string {
  return `shat_al_arab_map_${mapId}_default_v1`
}

function readStoredMapForZone(mapId: MapZoneId, kind: 'working' | 'default'): MapData | null {
  const key = kind === 'working' ? mapWorkingStorageKey(mapId) : mapDefaultStorageKey(mapId)
  const data = readStoredMap(key)
  if (data) return data
  if (mapId === 'default') {
    const legacyKey = kind === 'working' ? LEGACY_WORKING_STORAGE_KEY : LEGACY_DEFAULT_STORAGE_KEY
    return readStoredMap(legacyKey)
  }
  return null
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function safeParseMap(raw: string | null): MapData | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as MapData
  } catch {
    return null
  }
}

function mapStorageDisabled(): boolean {
  return import.meta.env.VITE_MAP_DISABLE_LOCAL_STORAGE === 'true'
}

function readStoredMap(key: string): MapData | null {
  if (mapStorageDisabled()) return null
  if (!hasStorage()) return null
  return safeParseMap(window.localStorage.getItem(key))
}

function writeStoredMap(key: string, map: MapData) {
  if (mapStorageDisabled()) return
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(map))
  } catch {
    // ignore storage quota / private mode failures
  }
}

function mapComponentKeys(map: MapData): string[] {
  const keys: string[] = []
  for (const b of map.blocks) keys.push(`block:${b.id}`)
  for (const f of map.facilities) {
    keys.push(`facility:${f.id}`)
    keys.push(`facility-label:${f.id}`)
  }
  for (const r of map.roads) keys.push(`road:${r.id}`)
  return keys
}

function withInitializedZIndex(map: MapData): MapData {
  const keys = mapComponentKeys(map)
  if (keys.length === 0) return map

  const existing = map.componentZIndex ?? {}
  const allZeroOrMissing = keys.every((k) => (existing[k] ?? 0) === 0)

  if (allZeroOrMissing) {
    const zi: Record<string, number> = {}
    keys.forEach((k, i) => {
      zi[k] = i
    })
    return { ...map, componentZIndex: zi }
  }

  let maxExisting = -1
  for (const k of keys) {
    const z = existing[k]
    if (typeof z === 'number' && Number.isFinite(z)) {
      maxExisting = Math.max(maxExisting, z)
    }
  }

  const zi: Record<string, number> = { ...existing }
  let cursor = Math.max(0, maxExisting + 1)
  for (const k of keys) {
    const z = zi[k]
    if (typeof z !== 'number' || !Number.isFinite(z)) {
      zi[k] = cursor++
    }
  }
  return { ...map, componentZIndex: zi }
}

function emptyMapData(): MapData {
  return {
    meta: { width: 1000, height: 700, name: '', version: 1 },
    plots: [],
    roads: [],
    blocks: [],
    facilities: [],
    labels: [],
  }
}

/** Per-zone public JSON cache filled after fetch in bootstrap / zone switch. */
const cachedPublicMaps: Partial<Record<MapZoneId, MapData>> = {}

function resolveInitialMap(mapId: MapZoneId = 'default'): MapData {
  if (isSupabaseConfigured()) {
    return withInitializedZIndex(emptyMapData())
  }
  const defaultDesign = readStoredMapForZone(mapId, 'default')
  const workingDesign = readStoredMapForZone(mapId, 'working')
  return withInitializedZIndex(cloneMap(workingDesign ?? defaultDesign ?? emptyMapData()))
}

function resolveDefaultMap(mapId: MapZoneId): MapData {
  const fromStorage = readStoredMapForZone(mapId, 'default')
  const base = fromStorage ?? cachedPublicMaps[mapId] ?? emptyMapData()
  return withInitializedZIndex(cloneMap(base))
}

function resolveLocalMap(mapId: MapZoneId): MapData {
  const workingDesign = readStoredMapForZone(mapId, 'working')
  const defaultDesign = readStoredMapForZone(mapId, 'default')
  const base = workingDesign ?? defaultDesign ?? cachedPublicMaps[mapId] ?? emptyMapData()
  return withInitializedZIndex(cloneMap(base))
}

function legacyUnitToPlotStatus(s: UnitStatus): Plot['status'] {
  switch (s) {
    case UnitStatus.SOLD:
      return 'sold'
    case UnitStatus.RESERVED:
      return 'reserved'
    case UnitStatus.EMPLOYEE_RESERVED:
      return 'employee_reserved'
    default:
      return 'available'
  }
}

export type MapViewport = {
  scale: number
  positionX: number
  positionY: number
}

function cloneMap(data: MapData): MapData {
  return JSON.parse(JSON.stringify(data)) as MapData
}

function mergeCT(prev: ComponentTransform | undefined, patch: Partial<ComponentTransform>): ComponentTransform {
  const merged = { ...defaultComponentTransform(), ...prev, ...patch }
  const legacyUniform = Number.isFinite(merged.uniformScale) ? merged.uniformScale : 1
  return {
    ...merged,
    scaleX: Number.isFinite(merged.scaleX) ? merged.scaleX : legacyUniform,
    scaleY: Number.isFinite(merged.scaleY) ? merged.scaleY : legacyUniform,
  }
}

function componentCount(map: MapData): number {
  return map.blocks.length + map.roads.length + map.facilities.length * 2
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

const defaultLayers: MapLayerVisibility = {
  plots: true,
  roads: true,
  blocks: true,
  facilities: true,
  labels: true,
  blockMarkers: true,
}

type MapState = {
  activeMapId: MapZoneId
  /** True while switching zones and loading map data for the new zone. */
  zoneLoading: boolean
  map: MapData
  canUndo: boolean
  canRedo: boolean
  selectedPlotIds: string[]
  /** When true, App may open the unit details modal for the sole selected plot (consumed in App). */
  plotSelectionOpensUnitModal: boolean
  hoveredPlotId: string | null
  editMode: boolean
  editorTool: EditorTool
  layers: MapLayerVisibility
  drawing: DrawingState
  snapGrid: number
  viewport: MapViewport
  /** Selected components: `road:*`, `facility:*`, `facility-label:*`, `block:*`. */
  selectedComponentKeys: string[]

  setActiveMapId: (id: MapZoneId) => void

  setViewport: (v: Partial<MapViewport>) => void
  undo: () => void
  redo: () => void

  clickToggleComponent: (key: string) => void
  selectComponentsOnly: (keys: string[]) => void
  clearComponentSelection: () => void

  patchComponentTransform: (key: string, patch: Partial<ComponentTransform>) => void
  patchSelectedTransforms: (patch: Partial<ComponentTransform>) => void
  moveComponentsBy: (keys: string[], dx: number, dy: number) => void
  resetComponentTransforms: () => void
  setSelectedZIndex: (z: number) => void

  setLayers: (partial: Partial<MapLayerVisibility>) => void
  setEditMode: (on: boolean) => void
  setEditorTool: (t: EditorTool) => void

  selectPlot: (id: string | null, options?: { openUnitModal?: boolean }) => void
  clickTogglePlot: (id: string) => void
  selectPlotsOnly: (ids: string[], options?: { openUnitModal?: boolean }) => void
  clearPlotSelection: () => void
  selectPlotsInBlock: (blockId: string, plotIds: string[]) => void
  setHoveredPlot: (id: string | null) => void

  importMap: (data: MapData) => void
  exportMap: () => string
  resetToDemo: () => void
  /** @deprecated use publishDesign */
  saveCurrentAsDefault: () => void
  loadDefaultDesign: () => void
  previewMode: boolean
  setPreviewMode: (on: boolean) => void
  publishDesign: () => Promise<{ error: string | null }>
  reseedPlotState: () => Promise<{ error: string | null }>
  /** Align plot colors with dashboard unit records (same plot id as unit id). */
  syncPlotStatusesFromLegacyData: (blocks: LegacyBlock[]) => void

  addPlot: (plot: Plot) => void
  updatePlot: (id: string, patch: Partial<Plot>) => void
  updatePlots: (ids: string[], patch: Partial<Plot>) => void
  setBlockPlotsLabelFontSize: (blockId: string, size: number) => void
  deletePlot: (id: string) => void
  deletePlots: (ids: string[]) => void
  setPlotsStatus: (ids: string[], status: PlotStatus) => void
  updateVertex: (plotId: string, vertexIndex: number, point: Point) => void
  translatePlot: (plotId: string, dx: number, dy: number) => void

  addRoad: (road: Road) => void
  deleteRoad: (id: string) => void
  addBlock: (block: MapBlock) => void
  setBlockGrid: (id: string, rows: number, cols: number) => void
  patchBlock: (id: string, patch: Partial<MapBlock>) => void
  deleteBlock: (id: string) => void
  addFacility: (facility: Facility) => void
  deleteFacility: (id: string) => void
  addMapLabel: (label: MapLabel) => void
  addLabel: (label: MapLabel) => void
  patchMapLabel: (id: string, patch: Partial<MapLabel>) => void
  updateLabelText: (id: string, text: string) => void
  updateFacilityText: (id: string, text: string) => void
  patchFacility: (id: string, patch: Partial<Facility>) => void
  deleteMapLabel: (id: string) => void
  deleteSelectedComponents: () => void

  startDrawingPlot: () => void
  appendDrawingPoint: (p: Point) => void
  addPlotSketchPoint: (p: Point) => void
  addRoadSketchPoint: (p: Point) => void
  cancelDrawing: () => void
  finishDrawingPlot: (status?: Plot['status']) => void

  startDrawingRoad: () => void
  finishDrawingRoad: () => void

  startDrawingFacility: () => void
  appendFacilityPoint: (p: Point) => void
  closeFacilityRing: () => void
  startFacilityHole: () => void
  finishDrawingFacility: () => void
  updateFacilityVertex: (
    id: string,
    ring: 'outer' | number,
    vertexIndex: number,
    point: Point,
  ) => void
}

let plotCounter = 1
const HISTORY_LIMIT = 200
let undoStack: MapData[] = []
let redoStack: MapData[] = []
let historyPaused = false
let unsubPlotRealtime: (() => void) | null = null

function applyPlotStateRowToStore(row: PlotStateRow) {
  if (getPlotRealtimePreviewMode()) return
  if (row.map_id !== useMapStore.getState().activeMapId) return
  useMapStore.setState((s) => ({
    map: mergePlotStateIntoMap(s.map, [row]),
  }))
}

function subscribePlotRealtimeForZone(mapId: MapZoneId) {
  if (unsubPlotRealtime) {
    unsubPlotRealtime()
    unsubPlotRealtime = null
  }
  if (!isSupabaseConfigured()) return
  unsubPlotRealtime = subscribePlotStateRealtime((row) => {
    applyPlotStateRowToStore(row)
  }, mapId)
}

let zoneSwitchGeneration = 0

export const useMapStore = create<MapState>((set, get) => ({
  activeMapId: 'default',
  zoneLoading: false,
  map: resolveInitialMap('default'),
  canUndo: false,
  canRedo: false,
  selectedPlotIds: [],
  plotSelectionOpensUnitModal: false,
  hoveredPlotId: null,
  editMode: false,
  editorTool: 'select',
  layers: defaultLayers,
  drawing: { mode: 'idle' },
  snapGrid: 0,
  viewport: { scale: 1, positionX: 0, positionY: 0 },
  selectedComponentKeys: [],
  previewMode: false,

  setActiveMapId: (id) => {
    const currentId = get().activeMapId
    if (id === currentId) return

    if (!isSupabaseConfigured()) {
      writeStoredMap(mapWorkingStorageKey(currentId), get().map)
    }

    const gen = ++zoneSwitchGeneration

    set({
      activeMapId: id,
      zoneLoading: true,
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      selectedComponentKeys: [],
      drawing: { mode: 'idle' },
      previewMode: false,
    })
    setPlotRealtimePreviewMode(false)

    void (async () => {
      try {
        await reloadMapFromServer(id, true)
      } finally {
        if (gen === zoneSwitchGeneration) {
          useMapStore.setState({ zoneLoading: false })
        }
      }
    })()
    subscribePlotRealtimeForZone(id)
  },

  setPreviewMode: (on) => {
    setPlotRealtimePreviewMode(on)
    set(() => ({ previewMode: on }))
  },

  setViewport: (v) =>
    set((s) => ({
      viewport: { ...s.viewport, ...v },
    })),

  undo: () => {},
  redo: () => {},

  clickToggleComponent: (key) =>
    set((s) => {
      const set = new Set(s.selectedComponentKeys)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return {
        selectedComponentKeys: [...set],
        selectedPlotIds: [],
        plotSelectionOpensUnitModal: false,
      }
    }),

  selectComponentsOnly: (keys) =>
    set(() => ({
      selectedComponentKeys: keys,
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
    })),

  clearComponentSelection: () => set(() => ({ selectedComponentKeys: [] })),

  patchComponentTransform: (key, patch) =>
    set((s) => {
      const ct = s.map.componentTransforms ?? {}
      return {
        map: {
          ...s.map,
          componentTransforms: { ...ct, [key]: mergeCT(ct[key], patch) },
        },
      }
    }),

  patchSelectedTransforms: (patch) =>
    set((s) => {
      const ct = { ...(s.map.componentTransforms ?? {}) }
      for (const key of s.selectedComponentKeys) {
        ct[key] = mergeCT(ct[key], patch)
      }
      return { map: { ...s.map, componentTransforms: ct } }
    }),

  moveComponentsBy: (keys, dx, dy) =>
    set((s) => {
      const ct = { ...(s.map.componentTransforms ?? {}) }
      for (const key of keys) {
        const cur = mergeCT(ct[key], {})
        ct[key] = { ...cur, x: cur.x + dx, y: cur.y + dy }
      }
      return { map: { ...s.map, componentTransforms: ct } }
    }),

  resetComponentTransforms: () =>
    set((s) => ({
      map: { ...s.map, componentTransforms: {} },
      selectedComponentKeys: [],
    })),

  setSelectedZIndex: (z) =>
    set((s) => {
      if (s.selectedComponentKeys.length === 0) return s
      const max = componentCount(s.map)
      const nextZ = clamp(Math.round(z), 0, max)
      const zi = { ...(s.map.componentZIndex ?? {}) }
      for (const key of s.selectedComponentKeys) zi[key] = nextZ
      return { map: { ...s.map, componentZIndex: zi } }
    }),

  setLayers: (partial) =>
    set((s) => ({
      layers: { ...s.layers, ...partial },
    })),

  setEditMode: (on) =>
    set(() => ({
      editMode: on,
      drawing: { mode: 'idle' },
      editorTool: on ? get().editorTool : 'select',
    })),

  setEditorTool: (editorTool) => set(() => ({ editorTool, drawing: { mode: 'idle' } })),

  selectPlot: (id, options) => {
    get().selectPlotsOnly(id ? [id] : [], options)
  },

  clickTogglePlot: (id) =>
    set((s) => {
      const setIds = new Set(s.selectedPlotIds)
      if (setIds.has(id)) setIds.delete(id)
      else setIds.add(id)
      return {
        selectedPlotIds: [...setIds],
        plotSelectionOpensUnitModal: false,
        selectedComponentKeys: [],
      }
    }),

  selectPlotsOnly: (ids, options) =>
    set(() => ({
      selectedPlotIds: ids,
      plotSelectionOpensUnitModal:
        ids.length === 1 && (options?.openUnitModal ?? true),
      selectedComponentKeys: [],
    })),

  clearPlotSelection: () =>
    set(() => ({
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
    })),

  selectPlotsInBlock: (_blockId, plotIds) =>
    set(() => ({
      selectedPlotIds: plotIds,
      plotSelectionOpensUnitModal: false,
      selectedComponentKeys: [],
    })),

  setHoveredPlot: (hoveredPlotId) => set(() => ({ hoveredPlotId })),

  importMap: (data) =>
    set(() => ({
      map: withInitializedZIndex(cloneMap(data)),
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
      selectedComponentKeys: [],
    })),

  exportMap: () => JSON.stringify(get().map, null, 2),

  resetToDemo: () => {
    void (async () => {
      const mapId = get().activeMapId
      const seed = await fetchSeedMapFromPublic(mapId)
      if (!seed) return
      const base = withInitializedZIndex(cloneMap(seed))
      let merged = base
      if (isSupabaseConfigured()) {
        const bundle = await fetchRemoteMapBundle(mapId)
        if (!bundle.error) {
          merged = mergeDesignAndPlotStates(base, bundle.plotStates)
        }
      }
      historyPaused = true
      useMapStore.setState({
        map: merged,
        selectedPlotIds: [],
        plotSelectionOpensUnitModal: false,
        hoveredPlotId: null,
        drawing: { mode: 'idle' },
        selectedComponentKeys: [],
        previewMode: false,
      })
      lastMapSnapshot = cloneMap(merged)
      undoStack = []
      redoStack = []
      historyPaused = false
      useMapStore.setState({ canUndo: false, canRedo: false })
      setPlotRealtimePreviewMode(false)
    })()
  },

  saveCurrentAsDefault: () => {
    void get().publishDesign()
  },

  loadDefaultDesign: () => {
    void reloadMapFromServer()
  },

  publishDesign: async () => publishDesignRemote(get().map, get().activeMapId),

  reseedPlotState: async () => reseedPlotStateRemote(get().map, get().activeMapId),

  syncPlotStatusesFromLegacyData: (blocks) => {
    const statusByPlotId = new Map<string, Plot['status']>()
    for (const b of blocks) {
      for (const u of b.units) {
        statusByPlotId.set(u.id, legacyUnitToPlotStatus(u.status))
      }
    }
    set((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.map((p) => {
          const next = statusByPlotId.get(p.id)
          return next !== undefined && next !== p.status ? { ...p, status: next } : p
        }),
      },
    }))
  },

  addPlot: (plot) =>
    set((s) => ({
      map: { ...s.map, plots: [...s.map.plots, plot] },
    })),

  updatePlot: (id, patch) =>
    set((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    })),

  updatePlots: (ids, patch) =>
    set((s) => {
      const idSet = new Set(ids)
      return {
        map: {
          ...s.map,
          plots: s.map.plots.map((p) => (idSet.has(p.id) ? { ...p, ...patch } : p)),
        },
      }
    }),

  setBlockPlotsLabelFontSize: (blockId, size) =>
    set((s) => {
      const n = Math.min(64, Math.max(4, Math.round(size)))
      return {
        map: {
          ...s.map,
          plots: s.map.plots.map((p) =>
            p.blockId === blockId ? { ...p, labelFontSize: n } : p,
          ),
        },
      }
    }),

  deletePlot: (id) => {
    get().deletePlots([id])
  },

  deletePlots: (ids) =>
    set((s) => {
      const idSet = new Set(ids)
      return {
        map: {
          ...s.map,
          plots: s.map.plots.filter((p) => !idSet.has(p.id)),
        },
        selectedPlotIds: s.selectedPlotIds.filter((pid) => !idSet.has(pid)),
        plotSelectionOpensUnitModal:
          s.selectedPlotIds.some((pid) => idSet.has(pid))
            ? false
            : s.plotSelectionOpensUnitModal,
      }
    }),

  setPlotsStatus: (ids, status) =>
    set((s) => {
      const idSet = new Set(ids)
      const now = new Date().toISOString()
      return {
        map: {
          ...s.map,
          plots: s.map.plots.map((p) => {
            if (!idSet.has(p.id)) return p
            if (status === 'available') {
              const meta = stripBookingMeta(p.meta as Record<string, unknown> | undefined)
              return {
                ...p,
                status,
                meta: Object.keys(meta).length ? meta : undefined,
              }
            }
            if (status === 'reserved') {
              return {
                ...p,
                status,
                meta: {
                  ...(p.meta ?? {}),
                  reservedAt: now,
                  reservedUntil: undefined,
                  customerName: undefined,
                  note: undefined,
                },
              }
            }
            return {
              ...p,
              status,
              meta: {
                ...stripBookingMeta(p.meta as Record<string, unknown> | undefined),
              },
            }
          }),
        },
      }
    }),

  updateVertex: (plotId, vertexIndex, point) =>
    set((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.map((p) => {
          if (p.id !== plotId) return p
          const next = [...p.polygon]
          if (vertexIndex < 0 || vertexIndex >= next.length) return p
          next[vertexIndex] = point
          return { ...p, polygon: next }
        }),
      },
    })),

  translatePlot: (plotId, dx, dy) =>
    set((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.map((p) =>
          p.id === plotId ? { ...p, polygon: translatePolygon(p.polygon, dx, dy) } : p,
        ),
      },
    })),

  addRoad: (road) =>
    set((s) => ({
      map: { ...s.map, roads: [...s.map.roads, road] },
    })),

  deleteRoad: (id) =>
    set((s) => ({
      map: {
        ...s.map,
        roads: s.map.roads.filter((r) => r.id !== id),
        labels: s.map.labels.filter((l) => l.id !== `lbl-${id}`),
        componentTransforms: Object.fromEntries(
          Object.entries(s.map.componentTransforms ?? {}).filter(([k]) => k !== `road:${id}`),
        ),
        componentZIndex: Object.fromEntries(
          Object.entries(s.map.componentZIndex ?? {}).filter(([k]) => k !== `road:${id}`),
        ),
      },
      selectedComponentKeys: s.selectedComponentKeys.filter((k) => k !== `road:${id}`),
    })),

  addBlock: (block) =>
    set((s) => ({
      map: { ...s.map, blocks: [...s.map.blocks, block] },
    })),

  setBlockGrid: (id, rows, cols) =>
    set((s) => {
      const newRows = Math.max(1, Math.floor(rows))
      const newCols = Math.max(1, Math.floor(cols))
      let nextPlots = s.map.plots
      const blocks = s.map.blocks.map((b) => {
        if (b.id !== id) return b
        const oldRows = Math.max(1, b.rows ?? 1)
        const oldCols = Math.max(1, b.cols ?? 1)
        if (newRows === oldRows && newCols === oldCols) return b
        const nextPoly = resizeGridQuad(b.polygon, oldRows, oldCols, newRows, newCols)
        const polygon = nextPoly ?? b.polygon
        if (nextPoly && nextPoly.length === 4) {
          nextPlots = remapPlotsToBlockGrid(nextPlots, id, nextPoly, newRows, newCols)
        }
        return { ...b, rows: newRows, cols: newCols, polygon }
      })
      const blk = blocks.find((b) => b.id === id)
      const markerId = `blk-marker-${id}`
      const labels = s.map.labels.map((l) =>
        l.id === markerId && blk ? { ...l, position: polygonCentroid(blk.polygon) } : l,
      )
      return { map: { ...s.map, blocks, plots: nextPlots, labels } }
    }),

  patchBlock: (id, patch) =>
    set((s) => ({
      map: {
        ...s.map,
        blocks: s.map.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      },
    })),

  deleteBlock: (id) =>
    set((s) => ({
      map: {
        ...s.map,
        blocks: s.map.blocks.filter((b) => b.id !== id),
        plots: s.map.plots.filter((p) => p.blockId !== id),
        labels: s.map.labels.filter((l) => l.id !== `blk-marker-${id}`),
        componentTransforms: Object.fromEntries(
          Object.entries(s.map.componentTransforms ?? {}).filter(([k]) => k !== `block:${id}`),
        ),
        componentZIndex: Object.fromEntries(
          Object.entries(s.map.componentZIndex ?? {}).filter(([k]) => k !== `block:${id}`),
        ),
      },
      selectedComponentKeys: s.selectedComponentKeys.filter((k) => k !== `block:${id}`),
    })),

  addFacility: (facility) =>
    set((s) => ({
      map: { ...s.map, facilities: [...s.map.facilities, facility] },
    })),

  deleteFacility: (id) =>
    set((s) => ({
      map: {
        ...s.map,
        facilities: s.map.facilities.filter((f) => f.id !== id),
        componentTransforms: Object.fromEntries(
          Object.entries(s.map.componentTransforms ?? {}).filter(
            ([k]) => k !== `facility:${id}` && k !== `facility-label:${id}`,
          ),
        ),
        componentZIndex: Object.fromEntries(
          Object.entries(s.map.componentZIndex ?? {}).filter(
            ([k]) => k !== `facility:${id}` && k !== `facility-label:${id}`,
          ),
        ),
      },
      selectedComponentKeys: s.selectedComponentKeys.filter(
        (k) => k !== `facility:${id}` && k !== `facility-label:${id}`,
      ),
    })),

  addMapLabel: (label) =>
    set((s) => ({
      map: { ...s.map, labels: [...s.map.labels, label] },
    })),

  addLabel: (label) =>
    set((s) => ({
      map: { ...s.map, labels: [...s.map.labels, label] },
    })),

  updateLabelText: (id, text) =>
    set((s) => ({
      map: {
        ...s.map,
        labels: s.map.labels.map((l) => (l.id === id ? { ...l, text } : l)),
      },
    })),

  patchMapLabel: (id, patch) =>
    set((s) => ({
      map: {
        ...s.map,
        labels: s.map.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      },
    })),

  updateFacilityText: (id, text) =>
    set((s) => ({
      map: {
        ...s.map,
        facilities: s.map.facilities.map((f) => (f.id === id ? { ...f, label: text } : f)),
      },
    })),

  patchFacility: (id, patch) =>
    set((s) => ({
      map: {
        ...s.map,
        facilities: s.map.facilities.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    })),

  deleteMapLabel: (id) =>
    set((s) => ({
      map: {
        ...s.map,
        labels: s.map.labels.filter((l) => l.id !== id),
        componentTransforms: Object.fromEntries(
          Object.entries(s.map.componentTransforms ?? {}).filter(([k]) => k !== `label:${id}`),
        ),
        componentZIndex: Object.fromEntries(
          Object.entries(s.map.componentZIndex ?? {}).filter(([k]) => k !== `label:${id}`),
        ),
      },
      selectedComponentKeys: s.selectedComponentKeys.filter((k) => k !== `label:${id}`),
    })),

  deleteSelectedComponents: () =>
    set((s) => {
      if (s.selectedComponentKeys.length === 0) return s
      const selected = new Set(s.selectedComponentKeys)
      const map = s.map
      return {
        map: {
          ...map,
          roads: map.roads.filter((r) => !selected.has(`road:${r.id}`)),
          blocks: map.blocks.filter((b) => !selected.has(`block:${b.id}`)),
          plots: map.plots.filter((p) => !selected.has(`block:${p.blockId}`)),
          facilities: map.facilities.filter(
            (f) => !selected.has(`facility:${f.id}`) && !selected.has(`facility-label:${f.id}`),
          ),
          labels: map.labels.filter((l) => {
            if (selected.has(`road:${l.id.replace('lbl-', '')}`)) return false
            if (selected.has(`block:${l.id.replace('blk-marker-', '')}`)) return false
            if (selected.has(`label:${l.id}`)) return false
            return true
          }),
          componentTransforms: Object.fromEntries(
            Object.entries(map.componentTransforms ?? {}).filter(([k]) => !selected.has(k)),
          ),
          componentZIndex: Object.fromEntries(
            Object.entries(map.componentZIndex ?? {}).filter(([k]) => !selected.has(k)),
          ),
        },
        selectedComponentKeys: [],
      }
    }),

  startDrawingPlot: () => set(() => ({ drawing: { mode: 'plot', points: [] } })),

  appendDrawingPoint: (p) =>
    set((s) => {
      if (s.drawing.mode !== 'plot') return s
      return { drawing: { mode: 'plot', points: [...s.drawing.points, p] } }
    }),

  addPlotSketchPoint: (p) =>
    set((s) => {
      if (s.drawing.mode === 'plot') {
        return { drawing: { mode: 'plot', points: [...s.drawing.points, p] } }
      }
      return { drawing: { mode: 'plot', points: [p] } }
    }),

  addRoadSketchPoint: (p) =>
    set((s) => {
      if (s.drawing.mode === 'road') {
        return { drawing: { mode: 'road', points: [...s.drawing.points, p] } }
      }
      return { drawing: { mode: 'road', points: [p] } }
    }),

  cancelDrawing: () => set(() => ({ drawing: { mode: 'idle' }, editorTool: 'select' })),

  finishDrawingPlot: (status = 'available') => {
    const { drawing, map } = get()
    if (drawing.mode !== 'plot' || drawing.points.length < 3) {
      set(() => ({ drawing: { mode: 'idle' } }))
      return
    }
    const id = `plot-${Date.now()}-${plotCounter++}`
    const polygon = drawing.points
    const plot: Plot = {
      id,
      number: String(plotCounter % 100).padStart(2, '0'),
      status,
      polygon,
      blockId: 'custom',
      meta: {},
    }
    set(() => ({
      map: { ...map, plots: [...map.plots, plot] },
      drawing: { mode: 'idle' },
      selectedPlotIds: [id],
      plotSelectionOpensUnitModal: false,
    }))
  },

  startDrawingRoad: () => set(() => ({ drawing: { mode: 'road', points: [] } })),

  finishDrawingRoad: () => {
    const { drawing, map } = get()
    if (drawing.mode !== 'road' || drawing.points.length < 2) {
      set(() => ({ drawing: { mode: 'idle' } }))
      return
    }
    const id = `road-${Date.now()}`
    const road: Road = {
      id,
      points: drawing.points,
      strokeWidth: 10,
    }
    set(() => ({
      map: { ...map, roads: [...map.roads, road] },
      drawing: { mode: 'idle' },
    }))
  },

  startDrawingFacility: () =>
    set(() => ({
      editorTool: 'drawFacility',
      drawing: { mode: 'facility', stage: 'outer', outer: [], holes: [], currentRing: [] },
    })),

  appendFacilityPoint: (p) => {
    const { drawing, snapGrid } = get()
    if (drawing.mode !== 'facility') return
    let active = drawing
    if (active.outer.length >= 3 && active.currentRing.length === 0 && active.stage === 'outer') {
      active = { ...active, stage: 'hole' }
    }
    const snapped = snapGrid > 0 ? snapToGrid(p, snapGrid) : p
    const ring = active.currentRing
    if (ring.length >= 3) {
      const first = ring[0]
      const dx = snapped.x - first.x
      const dy = snapped.y - first.y
      if (dx * dx + dy * dy <= 64) {
        if (active !== drawing) set(() => ({ drawing: active }))
        get().closeFacilityRing()
        return
      }
    }
    set(() => ({
      drawing: { ...active, currentRing: [...ring, snapped] },
    }))
  },

  closeFacilityRing: () => {
    const { drawing } = get()
    if (drawing.mode !== 'facility' || drawing.currentRing.length < 3) return
    const closed = [...drawing.currentRing]
    if (drawing.stage === 'outer' && drawing.outer.length === 0) {
      set(() => ({
        drawing: { ...drawing, outer: closed, currentRing: [] },
      }))
      return
    }
    if (drawing.stage === 'hole') {
      set(() => ({
        drawing: { ...drawing, holes: [...drawing.holes, closed], currentRing: [] },
      }))
    }
  },

  startFacilityHole: () => {
    const { drawing } = get()
    if (drawing.mode !== 'facility' || drawing.outer.length < 3) return
    set(() => ({
      drawing: { ...drawing, stage: 'hole', currentRing: [] },
    }))
  },

  finishDrawingFacility: () => {
    const { drawing, map } = get()
    if (drawing.mode !== 'facility' || drawing.outer.length < 3) {
      set(() => ({ drawing: { mode: 'idle' }, editorTool: 'select' }))
      return
    }
    const id = `facility-${Date.now()}`
    const facility: Facility = {
      id,
      label: 'مرفق جديد',
      kind: 'service',
      polygon: drawing.outer,
      holes: drawing.holes.length > 0 ? drawing.holes : undefined,
    }
    set(() => ({
      map: { ...map, facilities: [...map.facilities, facility] },
      drawing: { mode: 'idle' },
      editorTool: 'select',
      selectedComponentKeys: [`facility:${id}`],
    }))
  },

  updateFacilityVertex: (id, ring, vertexIndex, point) => {
    const { snapGrid } = get()
    const snapped = snapGrid > 0 ? snapToGrid(point, snapGrid) : point
    set((s) => ({
      map: {
        ...s.map,
        facilities: s.map.facilities.map((f) => {
          if (f.id !== id) return f
          if (ring === 'outer') {
            const next = [...f.polygon]
            if (vertexIndex < 0 || vertexIndex >= next.length) return f
            next[vertexIndex] = snapped
            return { ...f, polygon: next }
          }
          const holes = f.holes ? f.holes.map((h) => [...h]) : []
          if (typeof ring !== 'number' || ring < 0 || ring >= holes.length) return f
          const hole = [...holes[ring]]
          if (vertexIndex < 0 || vertexIndex >= hole.length) return f
          hole[vertexIndex] = snapped
          holes[ring] = hole
          return { ...f, holes }
        }),
      },
    }))
  },
}))

useMapStore.setState({
  undo: () => {
    if (undoStack.length === 0) return
    const state = useMapStore.getState()
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push(cloneMap(state.map))
    historyPaused = true
    useMapStore.setState({
      map: cloneMap(prev),
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      selectedComponentKeys: [],
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
    })
    lastMapSnapshot = cloneMap(prev)
    historyPaused = false
  },
  redo: () => {
    if (redoStack.length === 0) return
    const state = useMapStore.getState()
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(cloneMap(state.map))
    historyPaused = true
    useMapStore.setState({
      map: cloneMap(next),
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      selectedComponentKeys: [],
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
    })
    lastMapSnapshot = cloneMap(next)
    historyPaused = false
  },
})

let lastMapSnapshot = cloneMap(useMapStore.getState().map)
useMapStore.subscribe((state) => {
  if (!isSupabaseConfigured()) {
    writeStoredMap(mapWorkingStorageKey(state.activeMapId), state.map)
  }
  if (historyPaused) return
  const changed = JSON.stringify(state.map) !== JSON.stringify(lastMapSnapshot)
  if (!changed) return
  undoStack.push(cloneMap(lastMapSnapshot))
  if (undoStack.length > HISTORY_LIMIT) undoStack = undoStack.slice(undoStack.length - HISTORY_LIMIT)
  redoStack = []
  lastMapSnapshot = cloneMap(state.map)
  if (!state.canUndo || state.canRedo) {
    useMapStore.setState({ canUndo: true, canRedo: false })
  }
})

/** Reload merged map from cloud backend (or local default when cloud mode is off). Clears import preview. */
export async function reloadMapFromServer(mapId?: MapZoneId, preferWorking = false): Promise<void> {
  const zoneId = mapId ?? useMapStore.getState().activeMapId

  if (!isSupabaseConfigured()) {
    if (!cachedPublicMaps[zoneId]) {
      const seed = await fetchSeedMapFromPublic(zoneId)
      if (seed) {
        cachedPublicMaps[zoneId] = withInitializedZIndex(cloneMap(seed))
      }
    }
    historyPaused = true
    const m = preferWorking ? resolveLocalMap(zoneId) : resolveDefaultMap(zoneId)
    useMapStore.setState({
      map: m,
      canUndo: false,
      canRedo: false,
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      selectedComponentKeys: [],
      drawing: { mode: 'idle' },
      previewMode: false,
    })
    lastMapSnapshot = cloneMap(m)
    undoStack = []
    redoStack = []
    historyPaused = false
    setPlotRealtimePreviewMode(false)
    return
  }

  const bundle = await fetchRemoteMapBundle(zoneId)
  if (bundle.error) {
    console.warn('[map] reload:', bundle.error)
    return
  }

  let design = bundle.design
  if (!design) {
    const seed = await fetchSeedMapFromPublic(zoneId)
    if (seed) {
      design = withInitializedZIndex(cloneMap(seed))
      cachedPublicMaps[zoneId] = cloneMap(design)
    }
  } else {
    design = withInitializedZIndex(cloneMap(design))
    cachedPublicMaps[zoneId] = cloneMap(design)
  }

  if (!design) return

  const merged = mergeDesignAndPlotStates(design, bundle.plotStates)

  historyPaused = true
  useMapStore.setState({
    map: merged,
    canUndo: false,
    canRedo: false,
    selectedPlotIds: [],
    plotSelectionOpensUnitModal: false,
    hoveredPlotId: null,
    selectedComponentKeys: [],
    drawing: { mode: 'idle' },
    previewMode: false,
  })
  lastMapSnapshot = cloneMap(merged)
  undoStack = []
  redoStack = []
  historyPaused = false
  setPlotRealtimePreviewMode(false)
}

/** Load map from cloud backend after login, or legacy public JSON + localStorage. */
export async function bootstrapPublicMap(): Promise<void> {
  if (!isSupabaseConfigured()) {
    try {
      const res = await fetch(publicInitialMapUrl(), { cache: 'no-store' })
      if (!res.ok) {
        console.warn(`[map] Initial map file missing (${res.status}):`, publicInitialMapUrl())
        return
      }
      const data = (await res.json()) as MapData
      cachedPublicMaps.default = withInitializedZIndex(cloneMap(data))
    } catch (e) {
      console.warn('[map] Failed to load initial map JSON from public folder:', e)
    }

    const hasSaved = !!(
      readStoredMapForZone('default', 'working') || readStoredMapForZone('default', 'default')
    )
    if (hasSaved || !cachedPublicMaps.default) return

    historyPaused = true
    const m = cloneMap(cachedPublicMaps.default)
    useMapStore.setState({
      map: m,
      canUndo: false,
      canRedo: false,
      selectedPlotIds: [],
      plotSelectionOpensUnitModal: false,
      hoveredPlotId: null,
      selectedComponentKeys: [],
      drawing: { mode: 'idle' },
    })
    lastMapSnapshot = cloneMap(m)
    undoStack = []
    redoStack = []
    historyPaused = false
    return
  }

  await reloadMapFromServer('default')
  subscribePlotRealtimeForZone('default')
}
