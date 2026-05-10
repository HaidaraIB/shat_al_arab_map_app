/**
 * Vector map schema — single source of truth for rendering, import/export,
 * and future API / collaboration layers.
 */

export type Point = {
  x: number
  y: number
}

export type PlotStatus = 'available' | 'reserved' | 'sold'

export type Plot = {
  id: string
  number: string
  status: PlotStatus
  polygon: Point[]
  blockId: string
  /** Optional map-units font size for the unit number label (default 9). */
  labelFontSize?: number
  /** Extensible metadata (pricing, ownership, reservation ids, etc.) */
  meta?: Record<string, unknown>
}

export type Road = {
  id: string
  label?: string
  points: Point[]
  strokeWidth?: number
  dashed?: boolean
}

export type Block = {
  id: string
  label: string
  /** Optional explicit class (A/B/C). If unset, UI derives from block title / marker label. */
  classification?: string
  polygon: Point[]
  rows?: number
  cols?: number
  strokeColor?: string
  fillColor?: string
  /**
   * Title strip thickness as a fraction of one unit row/column step (map space), typically 0.22–0.65.
   * Omit for editor default (~0.4).
   */
  labelStripDepthRatio?: number
}

export type FacilityKind = 'school' | 'market' | 'service' | 'utility' | 'other'

export type Facility = {
  id: string
  label: string
  polygon: Point[]
  subLabel?: string
  /** Map-units px for the main title (default 9). */
  labelFontSize?: number
  /** Map-units px for `subLabel` (default 7). */
  subLabelFontSize?: number
  kind?: FacilityKind
}

export type MapLabelKind = 'plot' | 'road' | 'block' | 'annotation'

export type MapLabel = {
  id: string
  text: string
  position: Point
  rotation?: number
  fontSize?: number
  fontWeight?: string
  kind?: MapLabelKind
}

export type MapLayerVisibility = {
  plots: boolean
  roads: boolean
  blocks: boolean
  facilities: boolean
  labels: boolean
  blockMarkers: boolean
}

export type MapMeta = {
  width: number
  height: number
  name?: string
  version?: number
}

/** Per selectable component (`road:*`, `facility:*`, `facility-label:*`, `block:*`). Pivot is local centroid per item (caption uses building centroid). */
export type ComponentTransform = {
  x: number
  y: number
  rotationDeg: number
  /** Horizontal scale (component width). */
  scaleX: number
  /** Vertical scale (component height). */
  scaleY: number
  /** @deprecated legacy uniform scale; kept for old saved maps compatibility. */
  uniformScale: number
}

export function defaultComponentTransform(): ComponentTransform {
  return { x: 0, y: 0, rotationDeg: 0, scaleX: 1, scaleY: 1, uniformScale: 1 }
}

/** @deprecated Layer-level transform removed; use per-component transforms only. */
export type MapRegionTransform = {
  offsetX: number
  offsetY: number
  rotationDeg: number
  /** Uniform scale around map center (multiplies with zoom-pan view scale). */
  uniformScale: number
}

export type MapData = {
  meta: MapMeta
  plots: Plot[]
  roads: Road[]
  blocks: Block[]
  facilities: Facility[]
  labels: MapLabel[]
  /** Persisted translate / rotate / scale per component id (`road:*`, `facility:*`, `facility-label:*`, `block:*`). */
  componentTransforms?: Record<string, ComponentTransform>
  /** Optional z-index for draggable components (`0..N` where larger draws on top). */
  componentZIndex?: Record<string, number>
}

export type EditorTool = 'select' | 'drawPlot' | 'drawRoad' | 'movePlot' | 'addLabel'

export type DrawingState =
  | { mode: 'idle' }
  | { mode: 'plot'; points: Point[] }
  | { mode: 'road'; points: Point[] }

export type VertexDragState = {
  plotId: string
  vertexIndex: number
} | null

export type PlotMoveState = {
  plotId: string
  startPointer: Point
  startPolygon: Point[]
} | null
