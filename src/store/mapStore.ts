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
  Point,
  Road,
} from '../types/map'
import { defaultComponentTransform } from '../types/map'
import type { Block as LegacyBlock } from '../types'
import { UnitStatus } from '../types'
import { polygonCentroid, resizeGridQuad, translatePolygon } from '../utils/geometry'
import { publicInitialMapUrl } from '../config/publicMap'

const MAP_DEFAULT_STORAGE_KEY = 'shat_al_arab_map_default_design_v1'
const MAP_WORKING_STORAGE_KEY = 'shat_al_arab_map_working_design_v1'

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

/** Filled after `fetch` in bootstrap; used by reset/load default when nothing saved under the default key. */
let cachedPublicMap: MapData | null = null

function resolveInitialMap(): MapData {
  const defaultDesign = readStoredMap(MAP_DEFAULT_STORAGE_KEY)
  const workingDesign = readStoredMap(MAP_WORKING_STORAGE_KEY)
  return withInitializedZIndex(cloneMap(workingDesign ?? defaultDesign ?? emptyMapData()))
}

function resolveDefaultMap(): MapData {
  const fromStorage = readStoredMap(MAP_DEFAULT_STORAGE_KEY)
  const base = fromStorage ?? cachedPublicMap ?? emptyMapData()
  return withInitializedZIndex(cloneMap(base))
}

function legacyUnitToPlotStatus(s: UnitStatus): Plot['status'] {
  switch (s) {
    case UnitStatus.SOLD:
      return 'sold'
    case UnitStatus.RESERVED:
      return 'reserved'
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
  map: MapData
  canUndo: boolean
  canRedo: boolean
  selectedPlotId: string | null
  hoveredPlotId: string | null
  editMode: boolean
  editorTool: EditorTool
  layers: MapLayerVisibility
  drawing: DrawingState
  snapGrid: number
  viewport: MapViewport
  /** Selected components: `road:*`, `facility:*`, `facility-label:*`, `block:*`. */
  selectedComponentKeys: string[]

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

  selectPlot: (id: string | null) => void
  setHoveredPlot: (id: string | null) => void

  importMap: (data: MapData) => void
  exportMap: () => string
  resetToDemo: () => void
  saveCurrentAsDefault: () => void
  loadDefaultDesign: () => void
  /** Align plot colors with dashboard unit records (same plot id as unit id). */
  syncPlotStatusesFromLegacyData: (blocks: LegacyBlock[]) => void

  addPlot: (plot: Plot) => void
  updatePlot: (id: string, patch: Partial<Plot>) => void
  deletePlot: (id: string) => void
  updateVertex: (plotId: string, vertexIndex: number, point: Point) => void
  translatePlot: (plotId: string, dx: number, dy: number) => void

  addRoad: (road: Road) => void
  deleteRoad: (id: string) => void
  addBlock: (block: MapBlock) => void
  setBlockGrid: (id: string, rows: number, cols: number) => void
  deleteBlock: (id: string) => void
  addFacility: (facility: Facility) => void
  deleteFacility: (id: string) => void
  addMapLabel: (label: MapLabel) => void
  addLabel: (label: MapLabel) => void
  updateLabelText: (id: string, text: string) => void
  updateFacilityText: (id: string, text: string) => void
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
}

let plotCounter = 1
const HISTORY_LIMIT = 200
let undoStack: MapData[] = []
let redoStack: MapData[] = []
let historyPaused = false

export const useMapStore = create<MapState>((set, get) => ({
  map: resolveInitialMap(),
  canUndo: false,
  canRedo: false,
  selectedPlotId: null,
  hoveredPlotId: null,
  editMode: false,
  editorTool: 'select',
  layers: defaultLayers,
  drawing: { mode: 'idle' },
  snapGrid: 0,
  viewport: { scale: 1, positionX: 0, positionY: 0 },
  selectedComponentKeys: [],

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
      return { selectedComponentKeys: [...set] }
    }),

  selectComponentsOnly: (keys) => set(() => ({ selectedComponentKeys: keys })),

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

  selectPlot: (selectedPlotId) => set(() => ({ selectedPlotId })),
  setHoveredPlot: (hoveredPlotId) => set(() => ({ hoveredPlotId })),

  importMap: (data) =>
    set(() => ({
      map: withInitializedZIndex(cloneMap(data)),
      selectedPlotId: null,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
      selectedComponentKeys: [],
    })),

  exportMap: () => JSON.stringify(get().map, null, 2),

  resetToDemo: () =>
    set(() => ({
      map: resolveDefaultMap(),
      selectedPlotId: null,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
      selectedComponentKeys: [],
    })),

  saveCurrentAsDefault: () => {
    const m = cloneMap(get().map)
    writeStoredMap(MAP_DEFAULT_STORAGE_KEY, m)
    writeStoredMap(MAP_WORKING_STORAGE_KEY, m)
  },

  loadDefaultDesign: () =>
    set(() => ({
      map: resolveDefaultMap(),
      selectedPlotId: null,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
      selectedComponentKeys: [],
    })),

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

  deletePlot: (id) =>
    set((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.filter((p) => p.id !== id),
      },
      selectedPlotId: s.selectedPlotId === id ? null : s.selectedPlotId,
    })),

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
      const blocks = s.map.blocks.map((b) => {
        if (b.id !== id) return b
        const oldRows = Math.max(1, b.rows ?? 1)
        const oldCols = Math.max(1, b.cols ?? 1)
        if (newRows === oldRows && newCols === oldCols) return b
        const nextPoly = resizeGridQuad(b.polygon, oldRows, oldCols, newRows, newCols)
        const polygon = nextPoly ?? b.polygon
        return { ...b, rows: newRows, cols: newCols, polygon }
      })
      const blk = blocks.find((b) => b.id === id)
      const markerId = `blk-marker-${id}`
      const labels = s.map.labels.map((l) =>
        l.id === markerId && blk ? { ...l, position: polygonCentroid(blk.polygon) } : l,
      )
      return { map: { ...s.map, blocks, labels } }
    }),

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

  updateFacilityText: (id, text) =>
    set((s) => ({
      map: {
        ...s.map,
        facilities: s.map.facilities.map((f) => (f.id === id ? { ...f, label: text } : f)),
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

  cancelDrawing: () => set(() => ({ drawing: { mode: 'idle' } })),

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
      selectedPlotId: id,
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
      selectedPlotId: null,
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
      selectedPlotId: null,
      hoveredPlotId: null,
      drawing: { mode: 'idle' },
    })
    lastMapSnapshot = cloneMap(next)
    historyPaused = false
  },
})

let lastMapSnapshot = cloneMap(useMapStore.getState().map)
useMapStore.subscribe((state) => {
  writeStoredMap(MAP_WORKING_STORAGE_KEY, state.map)
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

/** Load `public/map-default.json` once; hydrate store if there is no saved working/default design. */
export async function bootstrapPublicMap(): Promise<void> {
  try {
    const res = await fetch(publicInitialMapUrl(), { cache: 'no-store' })
    if (!res.ok) {
      console.warn(`[map] Initial map file missing (${res.status}):`, publicInitialMapUrl())
      return
    }
    const data = (await res.json()) as MapData
    cachedPublicMap = withInitializedZIndex(cloneMap(data))
  } catch (e) {
    console.warn('[map] Failed to load initial map JSON from public folder:', e)
  }

  const hasSaved = !!(readStoredMap(MAP_WORKING_STORAGE_KEY) || readStoredMap(MAP_DEFAULT_STORAGE_KEY))
  if (hasSaved || !cachedPublicMap) return

  historyPaused = true
  const m = cloneMap(cachedPublicMap)
  useMapStore.setState({
    map: m,
    canUndo: false,
    canRedo: false,
    selectedPlotId: null,
    hoveredPlotId: null,
    selectedComponentKeys: [],
    drawing: { mode: 'idle' },
  })
  lastMapSnapshot = cloneMap(m)
  undoStack = []
  redoStack = []
  historyPaused = false
}
