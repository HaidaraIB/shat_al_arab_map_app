import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { useMapStore } from '../../store/mapStore'
import type { Block, ComponentTransform, Facility, MapData, MapLabel, Plot, Road } from '../../types/map'
import { defaultComponentTransform } from '../../types/map'
import {
  blockLabelStripLayout,
  plotCellPolygonFromGridQuad,
  polygonBounds,
  polygonCentroid,
  pointsBoundingBox,
} from '../../utils/geometry'
import {
  componentGroupTransform,
  pointsToSvgPoints,
  resolvedComponentScale,
  screenToSvgPoint,
  undoComponentScaleAt,
} from '../../utils/svg'
import { mapContentSheetSize } from '../../utils/mapContentSheet'
import { categoryForNewPlotInBlock, effectiveBlockLabel } from '../../utils/legacyBlocksFromMap'
import { isCBlock, toolbarCellToInternal, toolbarGridDimensions } from '../../utils/blockToolbarGrid'
import { Label } from './Label'
import { PlotPolygon } from './PlotPolygon'
import { RoadPath } from './RoadPath'
import { ConfirmDialog } from './ConfirmDialog'
import { Toolbar } from './Toolbar'
import { useAuth } from '../../lib/auth'
import { reloadMapFromServer } from '../../store/mapStore'
import { useToast } from '../ui/Toast'

function facilityFill(kind: Facility['kind']): string {
  switch (kind) {
    case 'school':
      return '#fef3c7'
    case 'market':
      return '#fce7f3'
    case 'service':
      return '#e0e7ff'
    case 'utility':
      return '#f1f5f9'
    default:
      return '#f8fafc'
  }
}

function roadKey(id: string) {
  return `road:${id}`
}

function facilityKey(id: string) {
  return `facility:${id}`
}

/** Facility caption lines — separate transform from the building polygon. */
function facilityLabelKey(id: string) {
  return `facility-label:${id}`
}

/** Axis-aligned hit / selection rect around centered facility labels (map coords). */
function facilityLabelBounds(f: Facility, cx: number, cy: number) {
  const line1 = f.label.length
  const line2 = f.subLabel?.length ?? 0
  const longest = Math.max(line1, line2, 4)
  const w = Math.min(560, Math.max(72, longest * 5.5 + 28))
  const h = f.subLabel ? 44 : 26
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/** Hit / selection rect for standalone map labels (same style as facility caption box). */
function standaloneLabelBounds(l: MapLabel) {
  const cx = l.position.x
  const cy = l.position.y
  const lines = l.text.split('\n')
  const fs = l.fontSize ?? 10
  const longest = Math.max(...lines.map((line) => Math.max(line.length, 1)), 4)
  const w = Math.min(560, Math.max(72, longest * fs * 0.52 + 28))
  const h = Math.max(26, lines.length * fs * 1.32 + 12)
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

function blockKey(id: string) {
  return `block:${id}`
}

function mergeTransform(mapCT: Record<string, ComponentTransform> | undefined, key: string): ComponentTransform {
  return { ...defaultComponentTransform(), ...mapCT?.[key] }
}

function roadPivot(r: Road): { x: number; y: number } {
  const bb = pointsBoundingBox(r.points, 0)
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
}

/** World-space axis-aligned bbox of a component’s local geometry after SVG `componentGroupTransform`. */
function worldAabbAfterGroupTransform(
  localMinX: number,
  localMinY: number,
  localMaxX: number,
  localMaxY: number,
  pivot: { x: number; y: number },
  t: ComponentTransform,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { sx: rsx, sy: rsy } = resolvedComponentScale(t)
  const m = new DOMMatrix()
    .translateSelf(t.x, t.y)
    .translateSelf(pivot.x, pivot.y)
    .rotateSelf(t.rotationDeg)
    .scaleSelf(rsx, rsy)
    .translateSelf(-pivot.x, -pivot.y)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const corners = [
    { x: localMinX, y: localMinY },
    { x: localMaxX, y: localMinY },
    { x: localMaxX, y: localMaxY },
    { x: localMinX, y: localMaxY },
  ]
  for (const c of corners) {
    const pt = new DOMPoint(c.x, c.y).matrixTransform(m)
    minX = Math.min(minX, pt.x)
    minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x)
    maxY = Math.max(maxY, pt.y)
  }
  return { minX, minY, maxX, maxY }
}

function rectsOverlapAabb(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)
}

function normalizeDragRect(x1: number, y1: number, x2: number, y2: number) {
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  }
}

type BlockMarkerLayout =
  | {
      mode: 'quad'
      corners: { x: number; y: number }[]
      cx: number
      cy: number
      label: string
      fs: number
      /** Perpendicular thickness in map units — caps label size. */
      stripDepth: number
      nx: number
      ny: number
    }
  | {
      mode: 'rect'
      x: number
      y: number
      width: number
      height: number
      cx: number
      cy: number
      label: string
      fs: number
      stripDepth: number
    }

/** Label band like an extra unit row (or column): along first row if vertical grid, else along first column. */
function blockMarkerLayout(block: Block, marker: MapLabel): BlockMarkerLayout {
  const label = marker.text || block.label
  const fs = marker.fontSize ?? 13
  const strip = blockLabelStripLayout(block, {
    stripDepthRatio: block.labelStripDepthRatio,
  })
  if (strip) {
    return {
      mode: 'quad',
      corners: strip.corners,
      cx: strip.cx,
      cy: strip.cy,
      label,
      fs,
      stripDepth: strip.stripDepth,
      nx: strip.nx,
      ny: strip.ny,
    }
  }
  const polyBb = polygonBounds(block.polygon)
  const ratio = block.labelStripDepthRatio ?? 0.4
  const r = Math.min(0.65, Math.max(0.22, ratio))
  const depthScale = 1.08 + r * 0.46
  const cellH = Math.max(4, (polyBb.maxY - polyBb.minY) / Math.max(1, block.rows ?? 1))
  const gap = 8 + r * 8
  const rowH = cellH * depthScale + gap * 0.35
  const w = Math.max(8, polyBb.maxX - polyBb.minX)
  const x = polyBb.minX
  const y = polyBb.minY - gap - rowH
  const h = rowH
  return {
    mode: 'rect',
    x,
    y,
    width: w,
    height: h,
    cx: x + w / 2,
    cy: y + h / 2,
    label,
    fs,
    stripDepth: h,
  }
}

function blockTableBounds(b: Block, plots: Plot[], marker: MapLabel | undefined) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const extend = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return
    const box = polygonBounds(pts)
    minX = Math.min(minX, box.minX)
    minY = Math.min(minY, box.minY)
    maxX = Math.max(maxX, box.maxX)
    maxY = Math.max(maxY, box.maxY)
  }
  extend(b.polygon)
  for (const p of plots) extend(p.polygon)
  if (marker) {
    const lay = blockMarkerLayout(b, marker)
    if (lay.mode === 'quad') {
      for (const p of lay.corners) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    } else {
      minX = Math.min(minX, lay.x)
      maxX = Math.max(maxX, lay.x + lay.width)
      minY = Math.min(minY, lay.y)
      maxY = Math.max(maxY, lay.y + lay.height)
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  const pad = 6
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad }
}

function resolvePlotGridCell(
  plot: Plot,
  blockBounds: { minX: number; minY: number; maxX: number; maxY: number },
  rows: number,
  cols: number,
): { row: number; col: number } {
  const metaRow = Number(plot.meta?.row)
  const metaCol = Number(plot.meta?.col)
  if (Number.isFinite(metaRow) && Number.isFinite(metaCol)) {
    return {
      row: Math.min(rows - 1, Math.max(0, Math.floor(metaRow))),
      col: Math.min(cols - 1, Math.max(0, Math.floor(metaCol))),
    }
  }
  const c = polygonCentroid(plot.polygon)
  const cellW = Math.max(1, (blockBounds.maxX - blockBounds.minX) / Math.max(1, cols))
  const cellH = Math.max(1, (blockBounds.maxY - blockBounds.minY) / Math.max(1, rows))
  return {
    row: Math.min(rows - 1, Math.max(0, Math.floor((c.y - blockBounds.minY) / cellH))),
    col: Math.min(cols - 1, Math.max(0, Math.floor((c.x - blockBounds.minX) / cellW))),
  }
}

function compareBlockIds(a: string, b: string): number {
  const ma = a.match(/^([A-Za-z]+)(\d+)$/)
  const mb = b.match(/^([A-Za-z]+)(\d+)$/)
  if (ma && mb) {
    if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1])
    return Number(ma[2]) - Number(mb[2])
  }
  return a.localeCompare(b, undefined, { numeric: true })
}

function countBands(values: number[], epsilon: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  let bands = 1
  let anchor = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i] - anchor) > epsilon) {
      bands++
      anchor = sorted[i]
    }
  }
  return bands
}

/** Grid + occupancy for add-unit toolbar; keyed by block id so the dropdown drives the summary. */
function computeBlockAddStats(block: Block, allPlots: Plot[]) {
  const internalRows = Math.max(1, block.rows ?? 1)
  const internalCols = Math.max(1, block.cols ?? 1)
  const { rows, cols } = toolbarGridDimensions(block)
  const plots = allPlots.filter((p) => p.blockId === block.id)
  const occupiedCells = plots.length
  const totalCells = internalRows * internalCols
  if (plots.length === 0) {
    return { rows, cols, occupiedRows: 0, occupiedCols: 0, occupiedCells, totalCells }
  }
  const centroids = plots.map((p) => polygonCentroid(p.polygon))
  const bounds = polygonBounds(block.polygon)
  const epsX = Math.max(0.5, (bounds.maxX - bounds.minX) * 0.02)
  const epsY = Math.max(0.5, (bounds.maxY - bounds.minY) * 0.02)
  const bandsX = countBands(
    centroids.map((c) => c.x),
    epsX,
  )
  const bandsY = countBands(
    centroids.map((c) => c.y),
    epsY,
  )
  // C blocks: toolbar “rows/cols” follow master-plan naming (transpose vs stored grid).
  const occupiedRows = isCBlock(block.id) ? bandsX : bandsY
  const occupiedCols = isCBlock(block.id) ? bandsY : bandsX
  return { rows, cols, occupiedRows, occupiedCols, occupiedCells, totalCells }
}

/**
 * Roads, facilities, and A/B/C block tables — each selectable/draggable; Ctrl+click multi-select.
 */
export function MapCanvas() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [isTransformMode, setIsTransformMode] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [reseedConfirmOpen, setReseedConfirmOpen] = useState(false)
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [reseedSubmitting, setReseedSubmitting] = useState(false)
  const [reseedTyped, setReseedTyped] = useState('')
  /** Rubber-band selection (map/SVG coordinates). */
  const [marqueeBox, setMarqueeBox] = useState<null | { x: number; y: number; width: number; height: number }>(null)
  const marqueeSessionRef = useRef<null | { pointerId: number; x1: number; y1: number; x2: number; y2: number }>(null)

  const map = useMapStore((s) => s.map)
  const meta = map.meta
  const layers = useMapStore((s) => s.layers)
  const selectedKeys = useMapStore((s) => s.selectedComponentKeys)
  const selectedPlotId = useMapStore((s) => s.selectedPlotId)
  const hoveredPlotId = useMapStore((s) => s.hoveredPlotId)
  const canUndo = useMapStore((s) => s.canUndo)
  const canRedo = useMapStore((s) => s.canRedo)

  const setViewport = useMapStore((s) => s.setViewport)
  const undo = useMapStore((s) => s.undo)
  const redo = useMapStore((s) => s.redo)
  const clickToggleComponent = useMapStore((s) => s.clickToggleComponent)
  const clearComponentSelection = useMapStore((s) => s.clearComponentSelection)
  const selectPlot = useMapStore((s) => s.selectPlot)
  const setHoveredPlot = useMapStore((s) => s.setHoveredPlot)
  const patchSelectedTransforms = useMapStore((s) => s.patchSelectedTransforms)
  const setSelectedZIndex = useMapStore((s) => s.setSelectedZIndex)
  const importMap = useMapStore((s) => s.importMap)
  const exportMap = useMapStore((s) => s.exportMap)
  const previewMode = useMapStore((s) => s.previewMode)
  const setPreviewMode = useMapStore((s) => s.setPreviewMode)
  const publishDesign = useMapStore((s) => s.publishDesign)
  const reseedPlotState = useMapStore((s) => s.reseedPlotState)
  const addPlot = useMapStore((s) => s.addPlot)
  const updatePlot = useMapStore((s) => s.updatePlot)
  const deletePlot = useMapStore((s) => s.deletePlot)
  const addRoad = useMapStore((s) => s.addRoad)
  const addBlock = useMapStore((s) => s.addBlock)
  const setBlockGrid = useMapStore((s) => s.setBlockGrid)
  const patchBlock = useMapStore((s) => s.patchBlock)
  const viewportScale = useMapStore((s) => s.viewport.scale)
  const addFacility = useMapStore((s) => s.addFacility)
  const addLabel = useMapStore((s) => s.addLabel)
  const updateLabelText = useMapStore((s) => s.updateLabelText)
  const updateFacilityText = useMapStore((s) => s.updateFacilityText)
  const patchMapLabel = useMapStore((s) => s.patchMapLabel)
  const patchFacility = useMapStore((s) => s.patchFacility)
  const deleteSelectedComponents = useMapStore((s) => s.deleteSelectedComponents)
  const selectComponentsOnly = useMapStore((s) => s.selectComponentsOnly)
  const moveComponentsBy = useMapStore((s) => s.moveComponentsBy)

  const ct = map.componentTransforms ?? {}

  /** Tile size passed to zoom lib — wider/taller than meta when drawing extends past artboard */
  const sheet = useMemo(() => mapContentSheetSize(map), [map])

  const roadLabels = useMemo(
    () => map.labels.filter((l) => l.kind === 'road'),
    [map.labels],
  )
  const blockLabels = useMemo(
    () => map.labels.filter((l) => l.kind === 'block'),
    [map.labels],
  )
  const otherLabels = useMemo(
    () => map.labels.filter((l) => l.kind !== 'road' && l.kind !== 'block'),
    [map.labels],
  )

  const plotsByBlock = useMemo(() => {
    const m = new Map<string, Plot[]>()
    for (const p of map.plots) {
      const arr = m.get(p.blockId) ?? []
      arr.push(p)
      m.set(p.blockId, arr)
    }
    return m
  }, [map.plots])

  useEffect(() => {
    const shouldIgnoreShortcut = () => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return false
      const tag = active.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      setIsTransformMode(e.ctrlKey || e.metaKey)
      if (shouldIgnoreShortcut()) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedPlotId) {
          deletePlot(selectedPlotId)
          return
        }
        deleteSelectedComponents()
      }
    }
    const onBlur = () => setIsTransformMode(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [deletePlot, deleteSelectedComponents, redo, selectedPlotId, undo])

  /** While Ctrl/Meta is held, infra hit targets exclude pan/zoom so component selection/drag stays usable. */
  const [mapTransformBlockInfra, setMapTransformBlockInfra] = useState(false)
  useEffect(() => {
    const syncModifiers = (e: KeyboardEvent | MouseEvent | PointerEvent) =>
      setMapTransformBlockInfra(e.ctrlKey || e.metaKey)
    const blur = () => setMapTransformBlockInfra(false)
    window.addEventListener('keydown', syncModifiers)
    window.addEventListener('keyup', syncModifiers)
    window.addEventListener('pointermove', syncModifiers)
    window.addEventListener('pointerdown', syncModifiers)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', syncModifiers)
      window.removeEventListener('keyup', syncModifiers)
      window.removeEventListener('pointermove', syncModifiers)
      window.removeEventListener('pointerdown', syncModifiers)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** Ctrl/Meta blocks panning on empty sheet so marquee + infra drag behave like a selection layer. */
  const mapPanZoomExcluded = useMemo(
    () =>
      mapTransformBlockInfra
        ? (['map-infra-hit', 'map-infra-select', 'map-infra-marquee-root'] as const)
        : [],
    [mapTransformBlockInfra],
  )

  const primaryTransform = useMemo(() => {
    const k = selectedKeys[0]
    if (!k) return defaultComponentTransform()
    return mergeTransform(ct, k)
  }, [selectedKeys, ct])

  const labelForRoad = useCallback(
    (roadId: string): MapLabel | undefined =>
      roadLabels.find((l) => l.id === `lbl-${roadId}`),
    [roadLabels],
  )

  const markerForBlock = useCallback(
    (blockId: string): MapLabel | undefined =>
      blockLabels.find((l) => l.id === `blk-marker-${blockId}`),
    [blockLabels],
  )

  const selectComponentExclusive = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault()
      e.stopPropagation()
      selectPlot(null)
      selectComponentsOnly([key])
    },
    [selectComponentsOnly, selectPlot],
  )

  const startComponentDrag = useCallback(
    (e: React.PointerEvent, key: string) => {
      const withToggleKey = e.ctrlKey || e.metaKey
      const state = useMapStore.getState()
      const alreadySelected = state.selectedComponentKeys.includes(key)

      // Ctrl/Cmd + click toggles selection (including unselect).
      if (withToggleKey) {
        e.stopPropagation()
        e.preventDefault()
        clickToggleComponent(key)
        return
      }

      // Drag without Ctrl only when the pressed item is already selected.
      if (!alreadySelected) return

      e.stopPropagation()
      e.preventDefault()
      const sel = useMapStore.getState().selectedComponentKeys
      const keysToMove = sel.length ? [...sel] : [key]
      if (!svgRef.current) return
      const p0 = screenToSvgPoint(svgRef.current, e.clientX, e.clientY)
      const last = { x: p0.x, y: p0.y }

      const move = (ev: PointerEvent) => {
        if (!svgRef.current) return
        const p = screenToSvgPoint(svgRef.current, ev.clientX, ev.clientY)
        const dx = p.x - last.x
        const dy = p.y - last.y
        last.x = p.x
        last.y = p.y
        useMapStore.getState().moveComponentsBy(keysToMove, dx, dy)
      }

      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [clickToggleComponent, moveComponentsBy],
  )

  const plotInteractiveForUser = useCallback(
    (plot: Plot) => isAdmin || plot.status === 'available',
    [isAdmin],
  )

  const handlePlotClick = useCallback(
    (plot: Plot, e: React.MouseEvent<SVGGElement>) => {
      e.stopPropagation()
      if (!plotInteractiveForUser(plot)) return
      // Second click of a double-click is ignored here; double-click selects the parent block instead.
      if (e.detail >= 2) return
      if (e.ctrlKey || e.metaKey) {
        clearComponentSelection()
        selectPlot(plot.id, { openUnitModal: false })
        return
      }
      selectPlot(plot.id)
    },
    [clearComponentSelection, plotInteractiveForUser, selectPlot],
  )

  const handlePlotDoubleClick = useCallback(
    (plot: Plot, e: React.MouseEvent<SVGGElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!plotInteractiveForUser(plot)) return
      selectPlot(null)
      if (map.blocks.some((bl) => bl.id === plot.blockId)) {
        selectComponentsOnly([blockKey(plot.blockId)])
      }
    },
    [map.blocks, plotInteractiveForUser, selectComponentsOnly, selectPlot],
  )

  const fitView = useCallback(() => {
    const api = transformRef.current
    const wrapper = (api as any)?.instance?.wrapperComponent as HTMLDivElement | undefined
    if (!api || !wrapper) return
    const pad = 20
    const usableW = Math.max(1, wrapper.clientWidth - pad * 2)
    const usableH = Math.max(1, wrapper.clientHeight - pad * 2)
    const scale = Math.max(
      0.03,
      Math.min(64, Math.min(usableW / meta.width, usableH / meta.height)),
    )
    const x = (wrapper.clientWidth - meta.width * scale) / 2
    const y = (wrapper.clientHeight - meta.height * scale) / 2
    api.setTransform(x, y, scale, 220)
  }, [meta.height, meta.width])

  const handleExportDisk = useCallback(() => {
    try {
      const json = exportMap()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'shat-al-arab-default-map.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('تم تصدير التصميم إلى ملف على الجهاز.')
    } catch {
      toast.error('تعذر تصدير الملف. حاول مرة أخرى.')
    }
  }, [exportMap, toast])

  const handleRequestPublishDesign = useCallback(() => {
    setPublishConfirmOpen(true)
  }, [])

  const handleConfirmPublishDesign = useCallback(async () => {
    setPublishSubmitting(true)
    try {
      const { error } = await publishDesign()
      if (error) {
        toast.error(`تعذر نشر التصميم: ${error}`)
        return
      }
      toast.success('تم نشر التصميم إلى النظام السحابي.')
      await reloadMapFromServer()
      setPublishConfirmOpen(false)
    } finally {
      setPublishSubmitting(false)
    }
  }, [publishDesign, toast])

  const handleDiscardImportPreview = useCallback(async () => {
    await reloadMapFromServer()
    setPreviewMode(false)
    toast.success('تم تجاهل المعاينة واستعادة البيانات من الخادم.')
  }, [setPreviewMode, toast])

  const handlePublishFromPreview = useCallback(async () => {
    const { error } = await publishDesign()
    if (error) {
      toast.error(`تعذر النشر: ${error}`)
      return
    }
    setPreviewMode(false)
    await reloadMapFromServer()
    toast.success('تم نشر التصميم (دون تغيير حالات الحجز على الخادم).')
  }, [publishDesign, setPreviewMode, toast])

  const handleOpenReseedFromPreview = useCallback(() => {
    setReseedTyped('')
    setReseedConfirmOpen(true)
  }, [])

  const handleConfirmReseed = useCallback(async () => {
    if (reseedTyped.trim() !== 'RESET') {
      toast.warning('اكتب RESET بالضبط للتأكيد.')
      return
    }
    const wasPreview = previewMode
    setReseedSubmitting(true)
    try {
      if (wasPreview) {
        const pub = await publishDesign()
        if (pub.error) {
          toast.error(pub.error)
          return
        }
      }
      const rs = await reseedPlotState()
      if (rs.error) {
        toast.error(rs.error)
        return
      }
      setPreviewMode(false)
      await reloadMapFromServer()
      setReseedConfirmOpen(false)
      toast.success(
        wasPreview
          ? 'تم نشر التصميم وإعادة تعيين حالات الوحدات.'
          : 'تم إعادة تعيين حالات الوحدات من الخريطة الحالية.',
      )
    } finally {
      setReseedSubmitting(false)
    }
  }, [publishDesign, reseedPlotState, reseedTyped, previewMode, setPreviewMode, toast])

  const handleImportDisk = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const onImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        importMap(parsed)
        setPreviewMode(true)
        toast.success(
          'تم استيراد الملف للمعاينة المحلية. استخدم شريط الإجراءات أعلاه للنشر أو التجاهل.',
        )
      } catch {
        toast.error('ملف غير صالح. يرجى اختيار JSON صحيح.')
      }
    },
    [importMap, setPreviewMode, toast],
  )

  const renderRoad = (r: Road) => {
    const key = roadKey(r.id)
    const t = mergeTransform(ct, key)
    const { sx, sy } = resolvedComponentScale(t)
    const pivot = roadPivot(r)
    const tf = componentGroupTransform(pivot.x, pivot.y, t)
    const sel = selectedKeys.includes(key)
    const lbl = labelForRoad(r.id)

    return (
      <g
        key={r.id}
        transform={tf}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, key)}
        onDoubleClick={(e) => selectComponentExclusive(e, key)}
      >
        <RoadPath road={r} selected={sel} />
        {lbl && (
          <g transform={undoComponentScaleAt(lbl.position.x, lbl.position.y, sx, sy)} className="pointer-events-none">
            <Label label={lbl} className="pointer-events-none fill-slate-700" />
          </g>
        )}
      </g>
    )
  }

  const renderFacilityPolygon = (f: Facility) => {
    const keyPoly = facilityKey(f.id)
    const pivot = polygonCentroid(f.polygon)
    const cx = pivot.x
    const cy = pivot.y

    const tPoly = mergeTransform(ct, keyPoly)
    const tfPoly = componentGroupTransform(cx, cy, tPoly)

    const selPoly = selectedKeys.includes(keyPoly)
    const bbPoly = pointsBoundingBox(f.polygon, 4)

    return (
      <g
        key={f.id}
        transform={tfPoly}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, keyPoly)}
        onDoubleClick={(e) => selectComponentExclusive(e, keyPoly)}
      >
        <polygon
          points={pointsToSvgPoints(f.polygon)}
          fill={facilityFill(f.kind)}
          fillOpacity={0.92}
          stroke="#64748b"
          strokeWidth={1}
          className="map-infra-hit"
        />
        {selPoly && (
          <rect
            x={bbPoly.x}
            y={bbPoly.y}
            width={bbPoly.width}
            height={bbPoly.height}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            rx={2}
            className="pointer-events-none"
          />
        )}
      </g>
    )
  }

  const renderFacilityLabel = (f: Facility) => {
    const keyLbl = facilityLabelKey(f.id)
    const pivot = polygonCentroid(f.polygon)
    const cx = pivot.x
    const cy = pivot.y
    const tLbl = mergeTransform(ct, keyLbl)
    const { sx: lsx, sy: lsy } = resolvedComponentScale(tLbl)
    const tfLbl = componentGroupTransform(cx, cy, tLbl)
    const selLbl = selectedKeys.includes(keyLbl)
    const bbLbl = facilityLabelBounds(f, cx, cy)
    return (
      <g
        key={`label-${f.id}`}
        transform={tfLbl}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, keyLbl)}
        onDoubleClick={(e) => selectComponentExclusive(e, keyLbl)}
      >
        <rect
          x={bbLbl.x}
          y={bbLbl.y}
          width={bbLbl.width}
          height={bbLbl.height}
          fill="transparent"
          className="map-infra-hit"
        />
        <g transform={undoComponentScaleAt(cx, cy, lsx, lsy)} className="pointer-events-none">
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="pointer-events-none fill-slate-800 font-bold uppercase"
            style={{ fontSize: f.labelFontSize ?? 9 }}
          >
            {f.label}
          </text>
        </g>
        {f.subLabel && (() => {
          const titleFs = f.labelFontSize ?? 9
          const subFs = f.subLabelFontSize ?? 7
          const subY = cy + Math.max(11, titleFs * 1.2)
          return (
            <g transform={undoComponentScaleAt(cx, subY, lsx, lsy)} className="pointer-events-none">
              <text
                x={cx}
                y={subY}
                textAnchor="middle"
                className="pointer-events-none fill-slate-500 font-semibold"
                style={{ fontSize: subFs }}
              >
                {f.subLabel}
              </text>
            </g>
          )
        })()}
        {selLbl && (
          <rect
            x={bbLbl.x}
            y={bbLbl.y}
            width={bbLbl.width}
            height={bbLbl.height}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            rx={2}
            className="pointer-events-none"
          />
        )}
      </g>
    )
  }

  const renderBlockTable = (b: Block) => {
    const key = blockKey(b.id)
    const plots = plotsByBlock.get(b.id) ?? []
    const marker = markerForBlock(b.id)
    const t = mergeTransform(ct, key)
    const { sx, sy } = resolvedComponentScale(t)
    const pivot = polygonCentroid(b.polygon)
    const tf = componentGroupTransform(pivot.x, pivot.y, t)
    const sel = selectedKeys.includes(key)
    const bb = blockTableBounds(b, plots, marker)
    return (
      <g
        key={b.id}
        transform={tf}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, key)}
        onDoubleClick={(e) => selectComponentExclusive(e, key)}
      >
        {bb.width > 0 && (
          <rect
            x={bb.x}
            y={bb.y}
            width={bb.width}
            height={bb.height}
            fill="transparent"
            className="map-infra-hit"
          />
        )}
        {layers.blocks && (
          <polygon
            points={pointsToSvgPoints(b.polygon)}
            fill="none"
            stroke={
              !b.strokeColor || b.strokeColor.toLowerCase() === '#ea580c'
                ? 'none'
                : b.strokeColor
            }
            strokeWidth={2}
            className="pointer-events-none"
          />
        )}
        {layers.blockMarkers && marker && (() => {
          const lay = blockMarkerLayout(b, marker)
          const vs = Math.max(0.04, viewportScale)
          const depth = lay.stripDepth
          const userMapFs = marker.fontSize ?? 13
          const fs = Math.max(5, userMapFs / vs)
          const tx =
            lay.mode === 'quad' ? lay.cx + lay.nx * (depth * 0.12) : lay.cx
          const ty =
            lay.mode === 'quad' ? lay.cy + lay.ny * (depth * 0.12) : lay.cy - depth * 0.08
          const counterRot =
            Math.abs(t.rotationDeg) > 0.08 ? `rotate(${-t.rotationDeg}, ${tx}, ${ty})` : undefined
          return (
            <g className="pointer-events-none">
              {lay.mode === 'quad' ? (
                <polygon
                  points={pointsToSvgPoints(lay.corners)}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
              ) : (
                <rect
                  x={lay.x}
                  y={lay.y}
                  width={lay.width}
                  height={lay.height}
                  rx={6}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
              )}
              <g transform={undoComponentScaleAt(tx, ty, sx, sy)}>
                <g transform={counterRot}>
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none select-none fill-slate-900 font-black [text-rendering:geometricPrecision]"
                    style={{
                      fontSize: fs,
                      fontWeight: marker.fontWeight ?? '800',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {lay.label}
                  </text>
                </g>
              </g>
            </g>
          )
        })()}
        {layers.plots &&
          plots.map((plot) => (
            <PlotPolygon
              key={plot.id}
              plot={plot}
              interactive={plotInteractiveForUser(plot)}
              hovered={hoveredPlotId === plot.id}
              selected={selectedPlotId === plot.id}
              inverseScaleX={sx}
              inverseScaleY={sy}
              viewportScale={viewportScale}
              blockRotationDeg={t.rotationDeg}
              onPointerEnter={() => setHoveredPlot(plot.id)}
              onPointerLeave={() => setHoveredPlot(null)}
              onClick={(e) => handlePlotClick(plot, e)}
              onDoubleClick={(e) => handlePlotDoubleClick(plot, e)}
            />
          ))}
        {sel && (
          <polygon
            points={pointsToSvgPoints(b.polygon)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="pointer-events-none"
          />
        )}
      </g>
    )
  }

  const renderStandaloneLabel = (l: MapLabel) => {
    const key = `label:${l.id}`
    const selected = selectedKeys.includes(key)
    const px = l.position.x
    const py = l.position.y
    const t = mergeTransform(ct, key)
    const { sx, sy } = resolvedComponentScale(t)
    const tf = componentGroupTransform(px, py, t)
    const bb = standaloneLabelBounds(l)
    return (
      <g
        key={l.id}
        transform={tf}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, key)}
        onDoubleClick={(e) => selectComponentExclusive(e, key)}
      >
        <rect
          x={bb.x}
          y={bb.y}
          width={bb.width}
          height={bb.height}
          fill="transparent"
          className="map-infra-hit"
        />
        <g transform={undoComponentScaleAt(px, py, sx, sy)} className="pointer-events-none">
          <Label label={l} className="pointer-events-none select-none fill-slate-900" />
        </g>
        {selected && (
          <rect
            x={bb.x}
            y={bb.y}
            width={bb.width}
            height={bb.height}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            rx={2}
            className="pointer-events-none"
          />
        )}
      </g>
    )
  }

  const allComponentKeys = useMemo(() => {
    const keys: string[] = []
    for (const b of map.blocks) keys.push(blockKey(b.id))
    for (const f of map.facilities) {
      keys.push(facilityKey(f.id))
      keys.push(facilityLabelKey(f.id))
    }
    for (const r of map.roads) keys.push(roadKey(r.id))
    if (layers.labels) {
      for (const l of otherLabels) keys.push(`label:${l.id}`)
    }
    return keys
  }, [layers.labels, map.blocks, map.facilities, map.roads, otherLabels])

  const collectKeysInMarquee = useCallback(
    (dragNorm: ReturnType<typeof normalizeDragRect>) => {
      const hit: string[] = []
      const addIf = (key: string, world: { minX: number; minY: number; maxX: number; maxY: number } | null) => {
        if (!world) return
        if (world.maxX - world.minX < 1e-6 || world.maxY - world.minY < 1e-6) return
        if (rectsOverlapAabb(dragNorm, world)) hit.push(key)
      }

      for (const r of map.roads) {
        if (!layers.roads) continue
        const key = roadKey(r.id)
        const bb = polygonBounds(r.points)
        if (r.points.length < 2) continue
        const pivot = roadPivot(r)
        const t = mergeTransform(ct, key)
        addIf(key, worldAabbAfterGroupTransform(bb.minX, bb.minY, bb.maxX, bb.maxY, pivot, t))
      }

      for (const b of map.blocks) {
        if (!layers.blocks) continue
        const key = blockKey(b.id)
        const plots = plotsByBlock.get(b.id) ?? []
        const marker = markerForBlock(b.id)
        const table = blockTableBounds(b, plots, marker)
        if (table.width <= 0 || table.height <= 0) continue
        const pivot = polygonCentroid(b.polygon)
        const t = mergeTransform(ct, key)
        addIf(
          key,
          worldAabbAfterGroupTransform(
            table.x,
            table.y,
            table.x + table.width,
            table.y + table.height,
            pivot,
            t,
          ),
        )
      }

      for (const f of map.facilities) {
        if (!layers.facilities) continue
        const pivot = polygonCentroid(f.polygon)
        const bb = polygonBounds(f.polygon)

        const kPoly = facilityKey(f.id)
        const tPoly = mergeTransform(ct, kPoly)
        addIf(kPoly, worldAabbAfterGroupTransform(bb.minX, bb.minY, bb.maxX, bb.maxY, pivot, tPoly))

        const kLbl = facilityLabelKey(f.id)
        const cx = pivot.x
        const cy = pivot.y
        const bbLbl = facilityLabelBounds(f, cx, cy)
        const tLbl = mergeTransform(ct, kLbl)
        addIf(
          kLbl,
          worldAabbAfterGroupTransform(
            bbLbl.x,
            bbLbl.y,
            bbLbl.x + bbLbl.width,
            bbLbl.y + bbLbl.height,
            pivot,
            tLbl,
          ),
        )
      }

      if (layers.labels) {
        for (const l of otherLabels) {
          const key = `label:${l.id}`
          const bb = standaloneLabelBounds(l)
          const t = mergeTransform(ct, key)
          const px = l.position.x
          const py = l.position.y
          addIf(
            key,
            worldAabbAfterGroupTransform(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height, { x: px, y: py }, t),
          )
        }
      }

      return hit
    },
    [
      ct,
      layers.blocks,
      layers.facilities,
      layers.labels,
      layers.roads,
      map.blocks,
      map.facilities,
      map.roads,
      markerForBlock,
      otherLabels,
      plotsByBlock,
    ],
  )

  const onSvgBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const el = e.target as Element
      if (el.closest('.map-infra-select')) return

      const mod = e.ctrlKey || e.metaKey
      if (!mod) {
        clearComponentSelection()
        selectPlot(null)
        return
      }

      e.preventDefault()
      e.stopPropagation()
      if (!svgRef.current) return
      const p0 = screenToSvgPoint(svgRef.current, e.clientX, e.clientY)
      marqueeSessionRef.current = {
        pointerId: e.pointerId,
        x1: p0.x,
        y1: p0.y,
        x2: p0.x,
        y2: p0.y,
      }
      setMarqueeBox(null)

      const onMove = (ev: PointerEvent) => {
        const s = marqueeSessionRef.current
        if (!s || ev.pointerId !== s.pointerId || !svgRef.current) return
        const p = screenToSvgPoint(svgRef.current, ev.clientX, ev.clientY)
        s.x2 = p.x
        s.y2 = p.y
        const n = normalizeDragRect(s.x1, s.y1, s.x2, s.y2)
        setMarqueeBox({
          x: n.minX,
          y: n.minY,
          width: Math.max(0, n.maxX - n.minX),
          height: Math.max(0, n.maxY - n.minY),
        })
      }

      const onEnd = (ev: PointerEvent) => {
        const s = marqueeSessionRef.current
        if (!s || ev.pointerId !== s.pointerId) return
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)

        marqueeSessionRef.current = null
        const n = normalizeDragRect(s.x1, s.y1, s.x2, s.y2)
        const dragW = n.maxX - n.minX
        const dragH = n.maxY - n.minY
        setMarqueeBox(null)

        if (dragW < 4 || dragH < 4) {
          clearComponentSelection()
          selectPlot(null)
          return
        }

        const keys = [...new Set(collectKeysInMarquee(n))] as string[]
        selectComponentsOnly(keys)
        selectPlot(null)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    },
    [clearComponentSelection, collectKeysInMarquee, selectComponentsOnly, selectPlot],
  )

  const layeredComponentKeys = useMemo(() => {
    const base = allComponentKeys
    const zMap = map.componentZIndex ?? {}
    return [...base].sort((a, b) => {
      const za = zMap[a] ?? 0
      const zb = zMap[b] ?? 0
      if (za !== zb) return za - zb
      return base.indexOf(a) - base.indexOf(b)
    })
  }, [allComponentKeys, map.componentZIndex])

  const zMax = allComponentKeys.length
  const zPosition = useMemo(() => {
    const key = selectedKeys[0]
    if (!key) return 0
    const z = map.componentZIndex?.[key] ?? 0
    return Math.max(0, Math.min(zMax, z))
  }, [map.componentZIndex, selectedKeys, zMax])

  const componentNodeByKey = useMemo(() => {
    const nodes = new Map<string, React.ReactNode>()
    for (const b of map.blocks) nodes.set(blockKey(b.id), renderBlockTable(b))
    for (const f of map.facilities) {
      nodes.set(facilityKey(f.id), renderFacilityPolygon(f))
      nodes.set(facilityLabelKey(f.id), renderFacilityLabel(f))
    }
    for (const r of map.roads) nodes.set(roadKey(r.id), renderRoad(r))
    for (const l of otherLabels) nodes.set(`label:${l.id}`, renderStandaloneLabel(l))
    return nodes
  }, [
    ct,
    handlePlotDoubleClick,
    hoveredPlotId,
    isTransformMode,
    layers,
    map.blocks,
    map.facilities,
    map.roads,
    otherLabels,
    renderRoad,
    selectComponentExclusive,
    selectedKeys,
    selectedPlotId,
    startComponentDrag,
    viewportScale,
  ])

  const primarySelectedKey = selectedKeys[0] ?? null
  const selectedTypeLabel = useMemo(() => {
    /** Plot/cell selection uses `selectedPlotId`, not `selectedComponentKeys` — same as font size / cell tools. */
    if (selectedPlotId) return 'خلية'
    if (!primarySelectedKey) return undefined
    if (primarySelectedKey.startsWith('road:')) return 'شارع'
    if (primarySelectedKey.startsWith('block:')) return 'بلوك'
    if (primarySelectedKey.startsWith('facility:')) return 'مرفق'
    if (primarySelectedKey.startsWith('facility-label:')) return 'تسمية مرفق'
    if (primarySelectedKey.startsWith('label:')) return 'نص'
    return 'عنصر'
  }, [primarySelectedKey, selectedPlotId])

  const editableLabelText = useMemo(() => {
    if (!primarySelectedKey) return null
    if (primarySelectedKey.startsWith('facility-label:')) {
      const id = primarySelectedKey.replace('facility-label:', '')
      return map.facilities.find((f) => f.id === id)?.label ?? null
    }
    if (primarySelectedKey.startsWith('road:')) {
      const id = primarySelectedKey.replace('road:', '')
      return map.labels.find((l) => l.id === `lbl-${id}`)?.text ?? null
    }
    if (primarySelectedKey.startsWith('block:')) {
      const id = primarySelectedKey.replace('block:', '')
      return map.labels.find((l) => l.id === `blk-marker-${id}`)?.text ?? null
    }
    if (primarySelectedKey.startsWith('label:')) {
      const id = primarySelectedKey.replace('label:', '')
      return map.labels.find((l) => l.id === id)?.text ?? null
    }
    return null
  }, [map.facilities, map.labels, primarySelectedKey])

  const selectionFontSize = useMemo(() => {
    if (selectedPlotId) {
      const p = map.plots.find((q) => q.id === selectedPlotId)
      if (!p) return null
      return p.labelFontSize ?? 9
    }
    if (!primarySelectedKey) return null
    if (primarySelectedKey.startsWith('road:')) {
      const l = map.labels.find((x) => x.id === `lbl-${primarySelectedKey.slice(5)}`)
      return l?.fontSize ?? 9
    }
    if (primarySelectedKey.startsWith('block:')) {
      const l = map.labels.find((x) => x.id === `blk-marker-${primarySelectedKey.slice(6)}`)
      return l?.fontSize ?? 13
    }
    if (primarySelectedKey.startsWith('label:')) {
      const l = map.labels.find((x) => x.id === primarySelectedKey.slice(6))
      return l?.fontSize ?? 10
    }
    if (primarySelectedKey.startsWith('facility-label:') || primarySelectedKey.startsWith('facility:')) {
      const fid = primarySelectedKey.startsWith('facility-label:')
        ? primarySelectedKey.slice(15)
        : primarySelectedKey.slice(9)
      const f = map.facilities.find((x) => x.id === fid)
      return f?.labelFontSize ?? 9
    }
    return null
  }, [map.facilities, map.labels, map.plots, primarySelectedKey, selectedPlotId])

  const selectionSubLabelFontSize = useMemo(() => {
    if (selectedPlotId) return null
    if (!primarySelectedKey) return null
    if (!primarySelectedKey.startsWith('facility-label:') && !primarySelectedKey.startsWith('facility:')) return null
    const fid = primarySelectedKey.startsWith('facility-label:')
      ? primarySelectedKey.slice(15)
      : primarySelectedKey.slice(9)
    const f = map.facilities.find((x) => x.id === fid)
    if (!f) return null
    return f.subLabelFontSize ?? 7
  }, [map.facilities, primarySelectedKey, selectedPlotId])

  const selectedBlockIdForToolbar = primarySelectedKey?.startsWith('block:')
    ? primarySelectedKey.replace('block:', '')
    : null

  const selectedBlockLabelStripPercent = useMemo(() => {
    if (!selectedBlockIdForToolbar) return null
    const bl = map.blocks.find((b) => b.id === selectedBlockIdForToolbar)
    if (!bl) return null
    const r = bl.labelStripDepthRatio ?? 0.4
    return Math.round(Math.min(0.65, Math.max(0.22, r)) * 100)
  }, [map.blocks, selectedBlockIdForToolbar])

  const handleSetBlockLabelStripPercent = useCallback(
    (pct: number) => {
      if (!selectedBlockIdForToolbar) return
      const ratio = Math.min(0.65, Math.max(0.22, pct / 100))
      patchBlock(selectedBlockIdForToolbar, { labelStripDepthRatio: ratio })
    },
    [patchBlock, selectedBlockIdForToolbar],
  )

  const handleSetSelectionFontSize = useCallback(
    (raw: number) => {
      const n = Math.min(64, Math.max(4, Math.round(raw)))
      if (selectedPlotId) {
        updatePlot(selectedPlotId, { labelFontSize: n })
        return
      }
      for (const key of selectedKeys) {
        if (key.startsWith('road:')) patchMapLabel(`lbl-${key.slice(5)}`, { fontSize: n })
        else if (key.startsWith('block:')) patchMapLabel(`blk-marker-${key.slice(6)}`, { fontSize: n })
        else if (key.startsWith('label:')) patchMapLabel(key.slice(6), { fontSize: n })
        else if (key.startsWith('facility-label:')) patchFacility(key.slice(15), { labelFontSize: n })
        else if (key.startsWith('facility:')) patchFacility(key.slice(9), { labelFontSize: n })
      }
    },
    [patchFacility, patchMapLabel, selectedKeys, selectedPlotId, updatePlot],
  )

  const handleSetSubLabelFontSize = useCallback(
    (raw: number) => {
      const n = Math.min(48, Math.max(4, Math.round(raw)))
      for (const key of selectedKeys) {
        if (key.startsWith('facility-label:')) patchFacility(key.slice(15), { subLabelFontSize: n })
        else if (key.startsWith('facility:')) patchFacility(key.slice(9), { subLabelFontSize: n })
      }
    },
    [patchFacility, selectedKeys],
  )

  const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const addContextPlot = useCallback((requestedBlockId: string, requestedLabel: string, requestedRow: number, requestedCol: number) => {
    const selectedBlockKey = selectedKeys.find((k) => k.startsWith('block:'))
    const blockId = requestedBlockId || selectedBlockKey?.replace('block:', '') || map.blocks[0]?.id || 'custom'
    const block = map.blocks.find((b) => b.id === blockId)
    if (!block) return
    const gridRows = Math.max(1, block.rows ?? 1)
    const gridCols = Math.max(1, block.cols ?? 1)
    const td = toolbarGridDimensions(block)
    const tr = Math.min(td.rows, Math.max(1, Math.floor(requestedRow)))
    const tc = Math.min(td.cols, Math.max(1, Math.floor(requestedCol)))
    const { row: rowFromToolbar, col: colFromToolbar } = toolbarCellToInternal(block, tr, tc)
    const row = Math.min(gridRows - 1, Math.max(0, rowFromToolbar))
    const col = Math.min(gridCols - 1, Math.max(0, colFromToolbar))
    const b = polygonBounds(block.polygon)
    const occupied = map.plots.some((p) => {
      if (p.blockId !== blockId) return false
      const mr = Number(p.meta?.row)
      const mc = Number(p.meta?.col)
      if (Number.isFinite(mr) && Number.isFinite(mc)) return mr === row && mc === col
      const pos = resolvePlotGridCell(p, b, gridRows, gridCols)
      return pos.row === row && pos.col === col
    })
    if (occupied) {
      toast.warning('هذه الخانة مشغولة بالفعل. اختر صفًا/عمودًا آخر.')
      return
    }
    const blockPlotsCount = map.plots.filter((p) => p.blockId === blockId).length
    const id = makeId('plot')
    const fallbackNumber = String(blockPlotsCount + 1).padStart(2, '0')
    const number = requestedLabel || fallbackNumber
    let polygon: Plot['polygon']
    if (block.polygon.length === 4) {
      const cell = plotCellPolygonFromGridQuad(block.polygon, gridRows, gridCols, row, col)
      if (!cell) return
      polygon = cell
    } else {
      const cellW = (b.maxX - b.minX) / gridCols
      const cellH = (b.maxY - b.minY) / gridRows
      polygon = [
        { x: b.minX + col * cellW, y: b.minY + row * cellH },
        { x: b.minX + (col + 1) * cellW, y: b.minY + row * cellH },
        { x: b.minX + (col + 1) * cellW, y: b.minY + (row + 1) * cellH },
        { x: b.minX + col * cellW, y: b.minY + (row + 1) * cellH },
      ]
    }
    const cat = categoryForNewPlotInBlock(map, block, blockId)
    const meta: Record<string, unknown> = { row, col }
    if (cat) meta.category = cat

    addPlot({
      id,
      number,
      status: 'available',
      blockId,
      polygon,
      meta,
    })
  }, [addPlot, map, map.blocks, map.plots, selectedKeys, toast])

  const growBlockGrid = useCallback(
    (blockId: string, addRows: number, addCols: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, (block.rows ?? 1) + addRows)
      const cols = Math.max(1, (block.cols ?? 1) + addCols)
      setBlockGrid(blockId, rows, cols)
      toast.success(`تم تحديث شبكة ${blockId} إلى ${rows}×${cols}.`)
    },
    [map.blocks, setBlockGrid, toast],
  )

  /** Toolbar “+صف / +عمود” follow master-plan axes for C blocks (transpose vs stored grid). */
  const growBlockGridFromToolbar = useCallback(
    (blockId: string, addToolbarRows: number, addToolbarCols: number) => {
      if (isCBlock(blockId)) growBlockGrid(blockId, addToolbarCols, addToolbarRows)
      else growBlockGrid(blockId, addToolbarRows, addToolbarCols)
    },
    [growBlockGrid],
  )

  const addContextRoad = useCallback(() => {
    const c = { x: meta.width / 2, y: meta.height / 2 }
    const id = makeId('road')
    addRoad({
      id,
      points: [
        { x: c.x - 70, y: c.y },
        { x: c.x + 70, y: c.y },
      ],
      strokeWidth: 12,
      label: 'طريق جديد',
    })
    addLabel({
      id: `lbl-${id}`,
      text: 'طريق جديد',
      position: c,
      kind: 'road',
      fontSize: 9,
    })
    selectComponentsOnly([`road:${id}`])
  }, [addLabel, addRoad, meta.height, meta.width, selectComponentsOnly])

  const addContextBlock = useCallback(() => {
    const c = { x: meta.width / 2, y: meta.height / 2 }
    const id = makeId('block')
    const w = 120
    const h = 180
    addBlock({
      id,
      label: id.toUpperCase(),
      rows: 1,
      cols: 1,
      polygon: [
        { x: c.x - w / 2, y: c.y - h / 2 },
        { x: c.x + w / 2, y: c.y - h / 2 },
        { x: c.x + w / 2, y: c.y + h / 2 },
        { x: c.x - w / 2, y: c.y + h / 2 },
      ],
      fillColor: 'transparent',
    })
    addLabel({
      id: `blk-marker-${id}`,
      text: id.toUpperCase(),
      position: c,
      kind: 'block',
      fontSize: 12,
      fontWeight: '800',
    })
    selectComponentsOnly([`block:${id}`])
  }, [addBlock, addLabel, meta.height, meta.width, selectComponentsOnly])

  const addContextFacility = useCallback(() => {
    const c = { x: meta.width / 2, y: meta.height / 2 }
    const id = makeId('facility')
    const w = 130
    const h = 70
    addFacility({
      id,
      label: 'مرفق جديد',
      kind: 'service',
      polygon: [
        { x: c.x - w / 2, y: c.y - h / 2 },
        { x: c.x + w / 2, y: c.y - h / 2 },
        { x: c.x + w / 2, y: c.y + h / 2 },
        { x: c.x - w / 2, y: c.y + h / 2 },
      ],
    })
    selectComponentsOnly([`facility:${id}`])
  }, [addFacility, meta.height, meta.width, selectComponentsOnly])

  const addContextLabel = useCallback(() => {
    const id = makeId('label')
    addLabel({
      id,
      text: 'نص جديد',
      position: { x: meta.width / 2, y: meta.height / 2 },
      kind: 'annotation',
      fontSize: 12,
      fontWeight: '700',
    })
  }, [addLabel, meta.height, meta.width])

  const handleSaveLabelText = useCallback(
    (text: string) => {
      if (!primarySelectedKey) return
      if (primarySelectedKey.startsWith('facility-label:')) {
        updateFacilityText(primarySelectedKey.replace('facility-label:', ''), text)
        return
      }
      if (primarySelectedKey.startsWith('road:')) {
        updateLabelText(`lbl-${primarySelectedKey.replace('road:', '')}`, text)
        return
      }
      if (primarySelectedKey.startsWith('block:')) {
        updateLabelText(`blk-marker-${primarySelectedKey.replace('block:', '')}`, text)
        return
      }
      if (primarySelectedKey.startsWith('label:')) {
        updateLabelText(primarySelectedKey.replace('label:', ''), text)
      }
    },
    [primarySelectedKey, updateFacilityText, updateLabelText],
  )

  const blockAddStatsById = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeBlockAddStats>> = {}
    for (const b of map.blocks) {
      out[b.id] = computeBlockAddStats(b, map.plots)
    }
    return out
  }, [map.blocks, map.plots])

  const toolbarBlockSelectOptions = useMemo(
    () =>
      [...map.blocks]
        .sort((a, b) => compareBlockIds(a.id, b.id))
        .map((b) => ({
          id: b.id,
          label: effectiveBlockLabel(map, b.id),
        })),
    [map],
  )

  const selectedPlot = useMemo(
    () => (selectedPlotId ? map.plots.find((p) => p.id === selectedPlotId) ?? null : null),
    [map.plots, selectedPlotId],
  )

  /** Block component explicitly selected on the map — drives add-unit + grid toolbar sections (no dropdown). */
  const mapSelectedBlockId = useMemo(
    () => selectedKeys.find((k) => k.startsWith('block:'))?.replace('block:', '') ?? null,
    [selectedKeys],
  )

  const updateSelectedPlotNumber = useCallback(
    (text: string) => {
      if (!selectedPlotId || !text) return
      updatePlot(selectedPlotId, { number: text })
      toast.success('تم تحديث رقم/اسم الخلية.')
    },
    [selectedPlotId, updatePlot, toast],
  )

  const deleteSelectedPlotCell = useCallback(() => {
    if (!selectedPlotId) return
    deletePlot(selectedPlotId)
    toast.success('تم حذف الخلية المحددة.')
  }, [deletePlot, selectedPlotId, toast])

  const deleteBlockRow = useCallback(
    (blockId: string, rowNumber1: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, block.rows ?? 1)
      const cols = Math.max(1, block.cols ?? 1)
      const row = Math.min(rows, Math.max(1, Math.floor(rowNumber1))) - 1
      if (rows <= 1) {
        toast.warning('لا يمكن حذف الصف الأخير.')
        return
      }
      for (const p of map.plots.filter((x) => x.blockId === blockId)) {
        const r = Number(p.meta?.row)
        const c = Number(p.meta?.col)
        if (!Number.isFinite(r) || !Number.isFinite(c)) continue
        if (r === row) deletePlot(p.id)
        else if (r > row) updatePlot(p.id, { meta: { ...(p.meta ?? {}), row: r - 1, col: c } })
      }
      setBlockGrid(blockId, rows - 1, cols)
      toast.success(`تم حذف الصف ${row + 1} من ${blockId}.`)
    },
    [deletePlot, map.blocks, map.plots, setBlockGrid, updatePlot, toast],
  )

  const deleteBlockCol = useCallback(
    (blockId: string, colNumber1: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, block.rows ?? 1)
      const cols = Math.max(1, block.cols ?? 1)
      const col = Math.min(cols, Math.max(1, Math.floor(colNumber1))) - 1
      if (cols <= 1) {
        toast.warning('لا يمكن حذف العمود الأخير.')
        return
      }
      for (const p of map.plots.filter((x) => x.blockId === blockId)) {
        const r = Number(p.meta?.row)
        const c = Number(p.meta?.col)
        if (!Number.isFinite(r) || !Number.isFinite(c)) continue
        if (c === col) deletePlot(p.id)
        else if (c > col) updatePlot(p.id, { meta: { ...(p.meta ?? {}), row: r, col: c - 1 } })
      }
      setBlockGrid(blockId, rows, cols - 1)
      toast.success(`تم حذف العمود ${col + 1} من ${blockId}.`)
    },
    [deletePlot, map.blocks, map.plots, setBlockGrid, updatePlot, toast],
  )

  const deleteBlockRowFromToolbar = useCallback(
    (blockId: string, rowNumber1: number) => {
      if (isCBlock(blockId)) deleteBlockCol(blockId, rowNumber1)
      else deleteBlockRow(blockId, rowNumber1)
    },
    [deleteBlockCol, deleteBlockRow],
  )

  const deleteBlockColFromToolbar = useCallback(
    (blockId: string, colNumber1: number) => {
      if (isCBlock(blockId)) deleteBlockRow(blockId, colNumber1)
      else deleteBlockCol(blockId, colNumber1)
    },
    [deleteBlockCol, deleteBlockRow],
  )

  return (
    <div className="map-zoom-root relative h-full w-full min-h-0 min-w-0 flex-1 rounded-[inherit] bg-slate-100">
      {isAdmin && previewMode && (
        <div
          className="absolute top-2 left-2 right-2 z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-950 shadow-lg backdrop-blur-sm"
          dir="rtl"
        >
          <span>معاينة ملف مستورد — لم يُنشر بعد على الخادم</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => void handleDiscardImportPreview()}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
            >
              تجاهل
            </button>
            <button
              type="button"
              onClick={() => void handlePublishFromPreview()}
              className="rounded-lg bg-primary px-2 py-1 text-white hover:opacity-95"
            >
              نشر التصميم فقط
            </button>
            <button
              type="button"
              onClick={handleOpenReseedFromPreview}
              className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-rose-900 hover:bg-rose-100"
            >
              نشر + إعادة حالات
            </button>
          </div>
        </div>
      )}
      {/* LTR: pan/zoom math + bounds match screen X; body RTL was mirroring layout and blocking one pan direction */}
      <div className="map-zoom-stage absolute inset-0" dir="ltr">
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.03}
          maxScale={64}
          smooth={false}
          limitToBounds={false}
          centerOnInit
          /* No post-pan / post-wheel snap-to “rest” animations — stay where you release */
          autoAlignment={{ disabled: true, sizeX: 0, sizeY: 0 }}
          panning={{
            velocityDisabled: true,
            excluded: [...mapPanZoomExcluded],
          }}
          wheel={{
            step: 0.09,
            excluded: [...mapPanZoomExcluded],
          }}
          pinch={{ step: 1, excluded: [...mapPanZoomExcluded] }}
          doubleClick={{ disabled: true }}
          onTransformed={(_, state) => {
            setViewport({
              scale: state.scale,
              positionX: state.positionX,
              positionY: state.positionY,
            })
          }}
        >
          <TransformComponent
            wrapperClass="map-zoom-inner-wrapper !w-full !h-full map-touch-pan"
            contentClass="map-zoom-inner-content"
          >
            <div
              className="map-content-sheet shrink-0 self-start shadow-none box-border overflow-visible"
              style={{
                width: sheet.width,
                height: sheet.height,
                maxWidth: sheet.width,
                maxHeight: sheet.height,
              }}
            >
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                overflow="visible"
                viewBox={`0 0 ${sheet.width} ${sheet.height}`}
                preserveAspectRatio="xMidYMid meet"
                className="map-zoom-svg block cursor-grab touch-none select-none bg-[#eef2ff] active:cursor-grabbing"
                onPointerDown={onSvgBackgroundPointerDown}
              >
                <rect
                  x={0}
                  y={0}
                  width={sheet.width}
                  height={sheet.height}
                  fill="#eef2ff"
                  className={mapTransformBlockInfra ? 'map-infra-marquee-root' : undefined}
                />

                {layeredComponentKeys.map((k) => {
                  if (k.startsWith('road:') && !layers.roads) return null
                  if (k.startsWith('facility:') && !layers.facilities) return null
                  if (k.startsWith('facility-label:') && !layers.facilities) return null
                  if (k.startsWith('label:') && !layers.labels) return null
                  if (k.startsWith('block:')) return componentNodeByKey.get(k) ?? null
                  return componentNodeByKey.get(k) ?? null
                })}
                {marqueeBox && (marqueeBox.width > 0 || marqueeBox.height > 0) ? (
                  <rect
                    x={marqueeBox.x}
                    y={marqueeBox.y}
                    width={marqueeBox.width}
                    height={marqueeBox.height}
                    fill="rgba(37,99,235,0.14)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    className="pointer-events-none"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <Toolbar
        componentTransform={primaryTransform}
        hideElementScaleSliders={Boolean(
          primarySelectedKey?.startsWith('label:') || primarySelectedKey?.startsWith('facility-label:'),
        )}
        hasSelection={selectedKeys.length > 0}
        selectionCount={selectedKeys.length}
        zPosition={zPosition}
        zMax={zMax}
        selectedTypeLabel={selectedTypeLabel}
        editableLabelText={editableLabelText}
        blockSelectOptions={toolbarBlockSelectOptions}
        mapSelectedBlockId={mapSelectedBlockId}
        blockAddStatsById={blockAddStatsById}
        onPatchSelected={patchSelectedTransforms}
        onChangeSelectedZ={setSelectedZIndex}
        onDeleteSelected={deleteSelectedComponents}
        onSaveLabelText={handleSaveLabelText}
        onAddPlot={addContextPlot}
        onGrowBlockGrid={growBlockGridFromToolbar}
        onDeleteBlockRow={deleteBlockRowFromToolbar}
        onDeleteBlockCol={deleteBlockColFromToolbar}
        selectedPlotNumber={selectedPlot?.number ?? null}
        onUpdateSelectedPlotNumber={updateSelectedPlotNumber}
        onDeleteSelectedPlot={deleteSelectedPlotCell}
        onAddRoad={addContextRoad}
        onAddBlock={addContextBlock}
        onAddFacility={addContextFacility}
        onAddLabel={addContextLabel}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onExportDisk={handleExportDisk}
        onPublishDesign={handleRequestPublishDesign}
        onImportDisk={handleImportDisk}
        onReseedPlotState={handleOpenReseedFromPreview}
        isAdmin={isAdmin}
        previewMode={previewMode}
        onZoomIn={() => transformRef.current?.zoomIn(0.4, 200)}
        onZoomOut={() => transformRef.current?.zoomOut(0.4, 200)}
        onFitView={fitView}
        selectedBlockLabelStripPercent={selectedBlockLabelStripPercent}
        onSetBlockLabelStripPercent={handleSetBlockLabelStripPercent}
        selectionFontSize={selectionFontSize}
        onSetSelectionFontSize={handleSetSelectionFontSize}
        selectionSubLabelFontSize={selectionSubLabelFontSize}
        onSetSubLabelFontSize={handleSetSubLabelFontSize}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFileChange}
      />
      <ConfirmDialog
        open={publishConfirmOpen}
        title="نشر التصميم"
        message="سيتم حفظ شكل الخريطة (البلوكات والشوارع والوحدات) في النظام السحابي. حالات الحجز الحالية على الخادم لن تُستبدل ما لم تختر إعادة تعيين الحالات."
        confirmLabel="نشر"
        cancelLabel="إلغاء"
        confirmVariant="primary"
        confirmLoading={publishSubmitting}
        onConfirm={() => void handleConfirmPublishDesign()}
        onCancel={() => setPublishConfirmOpen(false)}
      />
      <ConfirmDialog
        open={reseedConfirmOpen}
        title="إعادة تعيين حالات الوحدات"
        message="سيتم استبدال حجوزات الخادم بحالات الخريطة الحالية لكل وحدة."
        confirmLabel="تأكيد"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        disableConfirm={reseedTyped.trim() !== 'RESET'}
        confirmLoading={reseedSubmitting}
        onConfirm={() => void handleConfirmReseed()}
        onCancel={() => setReseedConfirmOpen(false)}
      >
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500">
            اكتب <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">RESET</span> للمتابعة.
          </p>
          <input
            type="text"
            value={reseedTyped}
            onChange={(e) => setReseedTyped(e.target.value)}
            disabled={reseedSubmitting}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="RESET"
            autoComplete="off"
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
