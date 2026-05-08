import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { useMapStore } from '../../store/mapStore'
import type { Block, ComponentTransform, Facility, MapData, MapLabel, Plot, Road } from '../../types/map'
import { defaultComponentTransform } from '../../types/map'
import { polygonBounds, polygonCentroid, pointsBoundingBox } from '../../utils/geometry'
import { componentGroupTransform, pointsToSvgPoints, screenToSvgPoint } from '../../utils/svg'
import { mapContentSheetSize } from '../../utils/mapContentSheet'
import { Label } from './Label'
import { PlotPolygon } from './PlotPolygon'
import { RoadPath } from './RoadPath'
import { productionSaveMapDefaultUrl, publicInitialMapUrl, saveMapDefaultApiUrl } from '../../config/publicMap'
import { ConfirmDialog } from './ConfirmDialog'
import { Toolbar } from './Toolbar'

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
    const r = 24
    minX = Math.min(minX, marker.position.x - r)
    maxX = Math.max(maxX, marker.position.x + r)
    minY = Math.min(minY, marker.position.y - r)
    maxY = Math.max(maxY, marker.position.y + r)
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
  const rows = Math.max(1, block.rows ?? 1)
  const cols = Math.max(1, block.cols ?? 1)
  const plots = allPlots.filter((p) => p.blockId === block.id)
  const occupiedCells = plots.length
  const totalCells = rows * cols
  if (plots.length === 0) {
    return { rows, cols, occupiedRows: 0, occupiedCols: 0, occupiedCells, totalCells }
  }
  const centroids = plots.map((p) => polygonCentroid(p.polygon))
  const bounds = polygonBounds(block.polygon)
  const epsX = Math.max(0.5, (bounds.maxX - bounds.minX) * 0.02)
  const epsY = Math.max(0.5, (bounds.maxY - bounds.minY) * 0.02)
  const occupiedCols = countBands(
    centroids.map((c) => c.x),
    epsX,
  )
  const occupiedRows = countBands(
    centroids.map((c) => c.y),
    epsY,
  )
  return { rows, cols, occupiedRows, occupiedCols, occupiedCells, totalCells }
}

/**
 * Roads, facilities, and A/B/C block tables — each selectable/draggable; Ctrl+click multi-select.
 */
export function MapCanvas() {
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [isTransformMode, setIsTransformMode] = useState(false)
  const [toast, setToast] = useState<null | { kind: 'success' | 'info'; message: string }>(null)
  const [saveDefaultConfirmOpen, setSaveDefaultConfirmOpen] = useState(false)

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
  const addPlot = useMapStore((s) => s.addPlot)
  const updatePlot = useMapStore((s) => s.updatePlot)
  const deletePlot = useMapStore((s) => s.deletePlot)
  const addRoad = useMapStore((s) => s.addRoad)
  const addBlock = useMapStore((s) => s.addBlock)
  const setBlockGrid = useMapStore((s) => s.setBlockGrid)
  const addFacility = useMapStore((s) => s.addFacility)
  const addLabel = useMapStore((s) => s.addLabel)
  const updateLabelText = useMapStore((s) => s.updateLabelText)
  const updateFacilityText = useMapStore((s) => s.updateFacilityText)
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

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

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

  const onSvgBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const el = e.target as Element
      if (el.closest('.map-infra-select')) return
      clearComponentSelection()
      selectPlot(null)
    },
    [clearComponentSelection, selectPlot],
  )

  const handlePlotClick = useCallback(
    (plot: Plot, e: React.MouseEvent<SVGGElement>) => {
      e.stopPropagation()
      // Keep Ctrl/Cmd reserved for transform selection mode; avoid accidental modal open.
      if (e.ctrlKey || e.metaKey) return
      selectPlot(plot.id)
    },
    [selectPlot],
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
      setToast({ kind: 'success', message: 'تم تصدير التصميم إلى ملف على الجهاز.' })
    } catch {
      setToast({ kind: 'info', message: 'تعذر تصدير الملف. حاول مرة أخرى.' })
    }
  }, [exportMap])

  const handleRequestSaveDefaultToProject = useCallback(() => {
    setSaveDefaultConfirmOpen(true)
  }, [])

  const handleConfirmSaveDefaultToProject = useCallback(async () => {
    setSaveDefaultConfirmOpen(false)
    const json = exportMap()

    if (import.meta.env.DEV) {
      try {
        const res = await fetch(saveMapDefaultApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: json,
        })
        if (res.ok) {
          setToast({ kind: 'success', message: 'تم تحديث public/map-default.json على جهاز التطوير.' })
          return
        }
      } catch {
        /* ignore */
      }
      setToast({ kind: 'info', message: 'تعذر الحفظ عبر خادم التطوير.' })
      return
    }

    const token = import.meta.env.VITE_MAP_SAVE_TOKEN?.trim()
    if (!token) {
      setToast({
        kind: 'info',
        message:
          'لم يُضبط VITE_MAP_SAVE_TOKEN عند بناء الموقع. أضف الرمز في ملف البيئة ثم أعد البناء، واضبط MAP_SAVE_TOKEN أو القيمة في save-map-default.php على الخادم.',
      })
      return
    }

    try {
      const res = await fetch(productionSaveMapDefaultUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Map-Save-Token': token,
        },
        body: json,
      })
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ?? res.statusText)
      }
      setToast({ kind: 'success', message: 'تم حفظ القالب على الخادم في ملف map-default.json.' })
      const fresh = await fetch(publicInitialMapUrl(), { cache: 'no-store' })
      if (fresh.ok) {
        importMap((await fresh.json()) as MapData)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({
        kind: 'info',
        message: `تعذر الكتابة على الخادم. تأكد من رفع save-map-default.php مع البناء وتطابق الرمز. ${msg}`,
      })
    }
  }, [exportMap, importMap])

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
        setToast({ kind: 'success', message: 'تم استيراد التصميم وحفظه في المتصفح.' })
      } catch {
        setToast({ kind: 'info', message: 'ملف غير صالح. يرجى اختيار JSON صحيح.' })
      }
    },
    [importMap],
  )

  const renderRoad = (r: Road) => {
    const key = roadKey(r.id)
    const t = mergeTransform(ct, key)
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
      >
        <RoadPath road={r} selected={sel} />
        {lbl && <Label label={lbl} className="pointer-events-none fill-slate-700" />}
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
    const tfLbl = componentGroupTransform(cx, cy, tLbl)
    const selLbl = selectedKeys.includes(keyLbl)
    const bbLbl = facilityLabelBounds(f, cx, cy)
    return (
      <g
        key={`label-${f.id}`}
        transform={tfLbl}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, keyLbl)}
      >
        <rect
          x={bbLbl.x}
          y={bbLbl.y}
          width={bbLbl.width}
          height={bbLbl.height}
          fill="transparent"
          className="map-infra-hit"
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none fill-slate-800 text-[9px] font-bold uppercase"
        >
          {f.label}
        </text>
        {f.subLabel && (
          <text x={cx} y={cy + 12} textAnchor="middle" className="pointer-events-none fill-slate-500 text-[7px] font-semibold">
            {f.subLabel}
          </text>
        )}
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
            stroke={b.strokeColor ?? '#ea580c'}
            strokeWidth={2}
            className="pointer-events-none"
          />
        )}
        {layers.plots &&
          plots.map((plot) => (
            <PlotPolygon
              key={plot.id}
              plot={plot}
              hovered={hoveredPlotId === plot.id}
              selected={selectedPlotId === plot.id}
              onPointerEnter={() => setHoveredPlot(plot.id)}
              onPointerLeave={() => setHoveredPlot(null)}
              onClick={(e) => handlePlotClick(plot, e)}
            />
          ))}
        {layers.blockMarkers && marker && (
          <g>
            <circle
              cx={marker.position.x}
              cy={marker.position.y}
              r={22}
              fill="white"
              stroke="#ea580c"
              strokeWidth={2}
            />
            <Label label={{ ...marker, fontSize: marker.fontSize ?? 12 }} />
          </g>
        )}
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
    const tf = componentGroupTransform(px, py, t)
    const bb = standaloneLabelBounds(l)
    return (
      <g
        key={l.id}
        transform={tf}
        className={`map-infra-select ${isTransformMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={(e) => startComponentDrag(e, key)}
      >
        <rect
          x={bb.x}
          y={bb.y}
          width={bb.width}
          height={bb.height}
          fill="transparent"
          className="map-infra-hit"
        />
        <Label label={l} className="pointer-events-none select-none fill-slate-900" />
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
  }, [ct, isTransformMode, layers, map.blocks, map.facilities, map.roads, otherLabels, renderRoad, selectedKeys])

  const primarySelectedKey = selectedKeys[0] ?? null
  const selectedTypeLabel = useMemo(() => {
    if (!primarySelectedKey) return undefined
    if (primarySelectedKey.startsWith('road:')) return 'شارع'
    if (primarySelectedKey.startsWith('block:')) return 'بلوك'
    if (primarySelectedKey.startsWith('facility:')) return 'مرفق'
    if (primarySelectedKey.startsWith('facility-label:')) return 'تسمية مرفق'
    if (primarySelectedKey.startsWith('label:')) return 'نص'
    return 'عنصر'
  }, [primarySelectedKey])

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

  const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const addContextPlot = useCallback((requestedBlockId: string, requestedLabel: string, requestedRow: number, requestedCol: number) => {
    const selectedBlockKey = selectedKeys.find((k) => k.startsWith('block:'))
    const blockId = requestedBlockId || selectedBlockKey?.replace('block:', '') || map.blocks[0]?.id || 'custom'
    const block = map.blocks.find((b) => b.id === blockId)
    if (!block) return
    const gridRows = Math.max(1, block.rows ?? 1)
    const gridCols = Math.max(1, block.cols ?? 1)
    const row = Math.min(gridRows, Math.max(1, Math.floor(requestedRow))) - 1
    const col = Math.min(gridCols, Math.max(1, Math.floor(requestedCol))) - 1
    const b = polygonBounds(block.polygon)
    const occupied = map.plots.some((p) => {
      if (p.blockId !== blockId) return false
      const pos = resolvePlotGridCell(p, b, gridRows, gridCols)
      return pos.row === row && pos.col === col
    })
    if (occupied) {
      setToast({ kind: 'info', message: 'هذه الخانة مشغولة بالفعل. اختر صفًا/عمودًا آخر.' })
      return
    }
    const blockPlotsCount = map.plots.filter((p) => p.blockId === blockId).length
    const cellW = (b.maxX - b.minX) / gridCols
    const cellH = (b.maxY - b.minY) / gridRows
    /** Match legacy/demo plots: polygons are flush to the cell grid (no inset). */
    const id = makeId('plot')
    const fallbackNumber = String(blockPlotsCount + 1).padStart(2, '0')
    const number = requestedLabel || fallbackNumber
    addPlot({
      id,
      number,
      status: 'available',
      blockId,
      polygon: [
        { x: b.minX + col * cellW, y: b.minY + row * cellH },
        { x: b.minX + (col + 1) * cellW, y: b.minY + row * cellH },
        { x: b.minX + (col + 1) * cellW, y: b.minY + (row + 1) * cellH },
        { x: b.minX + col * cellW, y: b.minY + (row + 1) * cellH },
      ],
      meta: { row, col },
    })
  }, [addPlot, map.blocks, map.plots, selectedKeys])

  const growBlockGrid = useCallback(
    (blockId: string, addRows: number, addCols: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, (block.rows ?? 1) + addRows)
      const cols = Math.max(1, (block.cols ?? 1) + addCols)
      setBlockGrid(blockId, rows, cols)
      setToast({ kind: 'success', message: `تم تحديث شبكة ${blockId} إلى ${rows}×${cols}.` })
    },
    [map.blocks, setBlockGrid],
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
      strokeColor: '#ea580c',
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

  const addPlotTargetBlockId =
    selectedKeys.find((k) => k.startsWith('block:'))?.replace('block:', '') ?? map.blocks[0]?.id

  const blockAddStatsById = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeBlockAddStats>> = {}
    for (const b of map.blocks) {
      out[b.id] = computeBlockAddStats(b, map.plots)
    }
    return out
  }, [map.blocks, map.plots])

  const selectedPlot = useMemo(
    () => (selectedPlotId ? map.plots.find((p) => p.id === selectedPlotId) ?? null : null),
    [map.plots, selectedPlotId],
  )

  const updateSelectedPlotNumber = useCallback(
    (text: string) => {
      if (!selectedPlotId || !text) return
      updatePlot(selectedPlotId, { number: text })
      setToast({ kind: 'success', message: 'تم تحديث رقم/اسم الخلية.' })
    },
    [selectedPlotId, updatePlot],
  )

  const deleteSelectedPlotCell = useCallback(() => {
    if (!selectedPlotId) return
    deletePlot(selectedPlotId)
    setToast({ kind: 'success', message: 'تم حذف الخلية المحددة.' })
  }, [deletePlot, selectedPlotId])

  const deleteBlockRow = useCallback(
    (blockId: string, rowNumber1: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, block.rows ?? 1)
      const cols = Math.max(1, block.cols ?? 1)
      const row = Math.min(rows, Math.max(1, Math.floor(rowNumber1))) - 1
      if (rows <= 1) {
        setToast({ kind: 'info', message: 'لا يمكن حذف الصف الأخير.' })
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
      setToast({ kind: 'success', message: `تم حذف الصف ${row + 1} من ${blockId}.` })
    },
    [deletePlot, map.blocks, map.plots, setBlockGrid, updatePlot],
  )

  const deleteBlockCol = useCallback(
    (blockId: string, colNumber1: number) => {
      const block = map.blocks.find((b) => b.id === blockId)
      if (!block) return
      const rows = Math.max(1, block.rows ?? 1)
      const cols = Math.max(1, block.cols ?? 1)
      const col = Math.min(cols, Math.max(1, Math.floor(colNumber1))) - 1
      if (cols <= 1) {
        setToast({ kind: 'info', message: 'لا يمكن حذف العمود الأخير.' })
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
      setToast({ kind: 'success', message: `تم حذف العمود ${col + 1} من ${blockId}.` })
    },
    [deletePlot, map.blocks, map.plots, setBlockGrid, updatePlot],
  )

  return (
    <div className="map-zoom-root relative h-full w-full min-h-0 min-w-0 flex-1 rounded-[inherit] bg-slate-100">
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
            excluded: ['map-infra-hit', 'map-infra-select'],
          }}
          wheel={{
            step: 0.09,
            excluded: ['map-infra-hit', 'map-infra-select'],
          }}
          pinch={{ step: 1 }}
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
                className="map-zoom-svg block cursor-grab touch-none select-none bg-[#f4f9f2] active:cursor-grabbing"
                onPointerDown={onSvgBackgroundPointerDown}
              >
                <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#f4f9f2" />

                {layeredComponentKeys.map((k) => {
                  if (k.startsWith('road:') && !layers.roads) return null
                  if (k.startsWith('facility:') && !layers.facilities) return null
                  if (k.startsWith('facility-label:') && !layers.facilities) return null
                  if (k.startsWith('label:') && !layers.labels) return null
                  if (k.startsWith('block:')) return componentNodeByKey.get(k) ?? null
                  return componentNodeByKey.get(k) ?? null
                })}
              </svg>
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <Toolbar
        componentTransform={primaryTransform}
        hasSelection={selectedKeys.length > 0}
        selectionCount={selectedKeys.length}
        zPosition={zPosition}
        zMax={zMax}
        selectedTypeLabel={selectedTypeLabel}
        editableLabelText={editableLabelText}
        blockOptions={map.blocks.map((b) => b.id)}
        defaultAddPlotBlockId={addPlotTargetBlockId}
        blockAddStatsById={blockAddStatsById}
        onPatchSelected={patchSelectedTransforms}
        onChangeSelectedZ={setSelectedZIndex}
        onDeleteSelected={deleteSelectedComponents}
        onSaveLabelText={handleSaveLabelText}
        onAddPlot={addContextPlot}
        onGrowBlockGrid={growBlockGrid}
        onDeleteBlockRow={deleteBlockRow}
        onDeleteBlockCol={deleteBlockCol}
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
        onSaveDefaultToProject={handleRequestSaveDefaultToProject}
        onImportDisk={handleImportDisk}
        onZoomIn={() => transformRef.current?.zoomIn(0.4, 200)}
        onZoomOut={() => transformRef.current?.zoomOut(0.4, 200)}
        onFitView={fitView}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFileChange}
      />
      <ConfirmDialog
        open={saveDefaultConfirmOpen}
        title="حفظ القالب الافتراضي"
        message="سيُستبدل ملف القالب الافتراضي على الخادم (map-default.json). يجب ضبط الرمز السري في البيئة والخادم كما في .env.example. هل تريد المتابعة؟"
        confirmLabel="نعم، احفظ"
        cancelLabel="إلغاء"
        confirmVariant="primary"
        onConfirm={handleConfirmSaveDefaultToProject}
        onCancel={() => setSaveDefaultConfirmOpen(false)}
      />
      {toast && (
        <div className="pointer-events-none absolute bottom-4 start-4 z-30">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl px-4 py-2 text-xs font-bold shadow-lg ${
              toast.kind === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
