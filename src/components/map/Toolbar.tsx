import React, { useEffect, useMemo, useState } from 'react'
import type { BlockLabelHeaderIntersectionStyle, BlockLabelHeaderPlacement, ComponentTransform, DrawingState, EditorTool, PlotStatus } from '../../types/map'
import { BLOCK_GRID_DIM_MAX } from '../../utils/geometry'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
  componentTransform: ComponentTransform
  hasSelection: boolean
  selectionCount: number
  zPosition: number
  zMax: number
  onPatchSelected: (patch: Partial<ComponentTransform>) => void
  onChangeSelectedZ: (z: number) => void
  selectedTypeLabel?: string
  editableLabelText?: string | null
  onDeleteSelected: () => void
  onSaveLabelText: (text: string) => void
  /** Sorted block ids with human-readable labels (marker text wins); value stays internal id. */
  blockSelectOptions: { id: string; label: string }[]
  /** Set when a block polygon is selected on the map (`block:…`); add-unit + grid tools use this block only. */
  mapSelectedBlockId: string | null
  /** Per-block grid + occupancy for add-unit / grid when `mapSelectedBlockId` is set. */
  blockAddStatsById?: Record<
    string,
    { rows: number; cols: number; occupiedRows: number; occupiedCols: number; occupiedCells: number; totalCells: number }
  >
  onAddPlot: (blockId: string, unitLabel: string, row: number, col: number) => void
  onGrowBlockGrid: (blockId: string, addRows: number, addCols: number) => void
  onDeleteBlockRow: (blockId: string, row: number) => void
  onDeleteBlockCol: (blockId: string, col: number) => void
  selectedPlotNumber?: string | null
  selectedPlotCount?: number
  onUpdateSelectedPlotNumber: (text: string) => void
  onDeleteSelectedPlot: () => void
  onSelectAllPlotsInBlock?: () => void
  onSetSelectedPlotsStatus?: (status: PlotStatus) => void
  onAddRoad: () => void
  onAddBlock: () => void
  onAddFacility: () => void
  onStartDrawFacility: () => void
  onCloseFacilityRing: () => void
  onStartFacilityHole: () => void
  onFinishDrawFacility: () => void
  onCancelDrawFacility: () => void
  facilityDrawing: Extract<DrawingState, { mode: 'facility' }> | null
  editorTool: EditorTool
  onAddLabel: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExportDisk: () => void
  onPublishDesign: () => void
  onImportDisk: () => void
  /** Destructive: rewrites plot_state from current map; opens RESET confirm in parent. */
  onReseedPlotState: () => void
  isAdmin: boolean
  /** When true, publish/reseed in toolbar are hidden (import preview banner handles publish). */
  previewMode?: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  /** 0–100 = % of one cell step along strip normal; null when no block selected. */
  selectedBlockLabelStripPercent?: number | null
  onSetBlockLabelStripPercent?: (percent: number) => void
  /** Block title placement mode; null when no block selected. */
  selectedBlockLabelHeaderPlacement?: BlockLabelHeaderPlacement | null
  onSetBlockLabelHeaderPlacement?: (placement: BlockLabelHeaderPlacement) => void
  /** Toolbar-logical internal grid-line indices for intersection mode. */
  selectedBlockLabelHeaderRowLine?: number | null
  selectedBlockLabelHeaderColLine?: number | null
  minBlockLabelHeaderRowLine?: number | null
  maxBlockLabelHeaderRowLine?: number | null
  minBlockLabelHeaderColLine?: number | null
  maxBlockLabelHeaderColLine?: number | null
  onSetBlockLabelHeaderRowLine?: (line: number) => void
  onSetBlockLabelHeaderColLine?: (line: number) => void
  /** Intersection badge style; null when no block selected. */
  selectedBlockLabelHeaderIntersectionStyle?: BlockLabelHeaderIntersectionStyle | null
  onSetBlockLabelHeaderIntersectionStyle?: (style: BlockLabelHeaderIntersectionStyle) => void
  /** Fixed map-units circle radius for intersection circle style. */
  selectedBlockLabelHeaderCircleRadiusMapUnits?: number | null
  onSetBlockLabelHeaderCircleRadiusMapUnits?: (radius: number) => void
  /** Toolbar row/col counts (C-block aware); null when no block selected. */
  selectedBlockToolbarRows?: number | null
  selectedBlockToolbarCols?: number | null
  minBlockToolbarRows?: number | null
  minBlockToolbarCols?: number | null
  onSetBlockToolbarRows?: (rows: number) => void
  onSetBlockToolbarCols?: (cols: number) => void
  /** Plot label font size for all units in selected block; null when no block selected. */
  selectedBlockPlotFontSize?: number | null
  onSetBlockPlotFontSize?: (size: number) => void
  /** When true, hide عرض/ارتفاع العنصر — no visual effect for standalone text / facility caption (font size is used instead). */
  hideElementScaleSliders?: boolean
  /** Map-units font size for the current text selection (plot, road, block title, free label, facility title). */
  selectionFontSize?: number | null
  onSetSelectionFontSize?: (size: number) => void
}

/** لوحة أدوات الخريطة — العربية فقط، مع طيّ وإظهار. */
export function Toolbar({
  componentTransform,
  hasSelection,
  selectionCount,
  zPosition,
  zMax,
  onPatchSelected,
  onChangeSelectedZ,
  selectedTypeLabel,
  editableLabelText,
  onDeleteSelected,
  onSaveLabelText,
  blockSelectOptions,
  mapSelectedBlockId,
  blockAddStatsById,
  onAddPlot,
  onGrowBlockGrid,
  onDeleteBlockRow,
  onDeleteBlockCol,
  selectedPlotNumber,
  selectedPlotCount = 0,
  onUpdateSelectedPlotNumber,
  onDeleteSelectedPlot,
  onSelectAllPlotsInBlock,
  onSetSelectedPlotsStatus,
  onAddRoad,
  onAddBlock,
  onAddFacility,
  onStartDrawFacility,
  onCloseFacilityRing,
  onStartFacilityHole,
  onFinishDrawFacility,
  onCancelDrawFacility,
  facilityDrawing,
  editorTool,
  onAddLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportDisk,
  onPublishDesign,
  onImportDisk,
  onReseedPlotState,
  isAdmin,
  previewMode = false,
  onZoomIn,
  onZoomOut,
  onFitView,
  selectedBlockLabelStripPercent = null,
  onSetBlockLabelStripPercent,
  selectedBlockLabelHeaderPlacement = null,
  onSetBlockLabelHeaderPlacement,
  selectedBlockLabelHeaderRowLine = null,
  selectedBlockLabelHeaderColLine = null,
  minBlockLabelHeaderRowLine = null,
  maxBlockLabelHeaderRowLine = null,
  minBlockLabelHeaderColLine = null,
  maxBlockLabelHeaderColLine = null,
  onSetBlockLabelHeaderRowLine,
  onSetBlockLabelHeaderColLine,
  selectedBlockLabelHeaderIntersectionStyle = null,
  onSetBlockLabelHeaderIntersectionStyle,
  selectedBlockLabelHeaderCircleRadiusMapUnits = null,
  onSetBlockLabelHeaderCircleRadiusMapUnits,
  selectedBlockToolbarRows = null,
  selectedBlockToolbarCols = null,
  minBlockToolbarRows = null,
  minBlockToolbarCols = null,
  onSetBlockToolbarRows,
  onSetBlockToolbarCols,
  selectedBlockPlotFontSize = null,
  onSetBlockPlotFontSize,
  hideElementScaleSliders = false,
  selectionFontSize = null,
  onSetSelectionFontSize,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [labelDraft, setLabelDraft] = useState('')
  const [newPlotLabel, setNewPlotLabel] = useState('')
  const [newPlotRow, setNewPlotRow] = useState(1)
  const [newPlotCol, setNewPlotCol] = useState(1)
  const [deleteRow, setDeleteRow] = useState(1)
  const [deleteCol, setDeleteCol] = useState(1)
  const [selectedPlotDraft, setSelectedPlotDraft] = useState('')
  const [pendingAction, setPendingAction] = useState<null | {
    title: string
    message: string
    confirmLabel: string
    run: () => void
  }>(null)
  const t = componentTransform

  const addFormStats = useMemo(() => {
    if (mapSelectedBlockId && blockAddStatsById?.[mapSelectedBlockId]) {
      return blockAddStatsById[mapSelectedBlockId]
    }
    return { rows: 1, cols: 1, occupiedRows: 0, occupiedCols: 0, occupiedCells: 0, totalCells: 1 }
  }, [mapSelectedBlockId, blockAddStatsById])

  const selectedBlockMenuLabel = useMemo(() => {
    const o = blockSelectOptions.find((x) => x.id === mapSelectedBlockId)
    return o?.label ?? mapSelectedBlockId ?? ''
  }, [blockSelectOptions, mapSelectedBlockId])

  const selectionFontSizeLabel = useMemo(() => {
    if (mapSelectedBlockId) return 'حجم خط عنوان البلوك'
    if (selectedPlotCount === 1) return 'حجم خط الخلية'
    if (selectedPlotCount > 1) return 'حجم خط الخلايا'
    if (selectedTypeLabel === 'شارع') return 'حجم خط الشارع'
    if (selectedTypeLabel === 'نص') return 'حجم خط النص'
    if (selectedTypeLabel === 'مرفق' || selectedTypeLabel === 'تسمية مرفق') return 'حجم خط المرفق'
    return 'حجم الخط'
  }, [mapSelectedBlockId, selectedPlotCount, selectedTypeLabel])

  const selectionFontSizeHint = useMemo(() => {
    if (mapSelectedBlockId) {
      return selectedBlockLabelHeaderPlacement === 'grid-intersection'
        ? 'اسم البلوك في وضع تقاطع الشبكة — مستقل عن أرقام الخلايا.'
        : 'اسم البلوك على المخطط — ليس أرقام الخلايا.'
    }
    return null
  }, [mapSelectedBlockId, selectedBlockLabelHeaderPlacement])

  useEffect(() => {
    setLabelDraft(editableLabelText ?? '')
  }, [editableLabelText])

  useEffect(() => {
    setNewPlotRow(1)
    setNewPlotCol(1)
    setDeleteRow(1)
    setDeleteCol(1)
  }, [mapSelectedBlockId])

  useEffect(() => {
    setSelectedPlotDraft(selectedPlotNumber ?? '')
  }, [selectedPlotNumber])

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const canScroll = el.scrollHeight > el.clientHeight
    if (!canScroll) return
    e.preventDefault()
    e.stopPropagation()
    el.scrollTop += e.deltaY
  }

  if (!expanded) {
    return (
      <div className="absolute top-4 start-4 z-20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg border border-slate-200/80 backdrop-blur-md hover:bg-white"
          aria-expanded={false}
        >
          إظهار أدوات الخريطة
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="map-toolbar absolute top-4 bottom-4 start-4 z-20 max-w-[280px]">
        <div
          className="h-full overflow-y-scroll overscroll-contain rounded-2xl bg-white/95 shadow-xl border border-slate-200/80 backdrop-blur-md p-3 space-y-3 pointer-events-auto [scrollbar-gutter:stable] [scrollbar-width:thin]"
          onWheel={handleWheelScroll}
        >
        <div className="flex items-start justify-between gap-2">
          <ul className="text-[10px] text-slate-600 leading-snug min-w-0 list-disc space-y-1 ps-3 marker:text-slate-400">
            <li>سحب للتحريك</li>
            <li>عجلة للتكبير</li>
            {isAdmin && (
              <>
                <li>Ctrl/Cmd+نقر تحديد سريع</li>
                <li>Ctrl/Cmd+سحب على الخلفية تحديد مستطيل</li>
                <li>Esc إلغاء رسم المرفق</li>
              </>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
            aria-expanded
          >
            طيّ
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500">العرض</p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={onZoomIn}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              aria-label="تكبير"
            >
              +
            </button>
            <button
              type="button"
              onClick={onZoomOut}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              aria-label="تصغير"
            >
              −
            </button>
            <button
              type="button"
              onClick={onFitView}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              ملاءمة العرض
            </button>
          </div>
          {isAdmin && (
            <>
              <p className="text-[10px] font-bold text-slate-500 pt-0.5">السجل والملف</p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  إعادة
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={onExportDisk}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  تصدير ملف
                </button>
                <button
                  type="button"
                  onClick={onImportDisk}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  استيراد ملف
                </button>
                {!previewMode && (
                  <>
                    <button
                      type="button"
                      onClick={onPublishDesign}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                    >
                      نشر التصميم
                    </button>
                    <button
                      type="button"
                      onClick={onReseedPlotState}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100"
                    >
                      إعادة حالات
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {isAdmin && (
        <div className="border-t border-slate-100 pt-2 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500">
              العنصر المحدد
              {selectionCount > 1 ? ` (${selectionCount})` : ''}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              النوع: {selectedTypeLabel ?? 'لا يوجد'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-2">
            <p className="text-[10px] font-bold text-slate-600">التحويل والطبقة</p>
            {selectionCount > 1 && (
              <p className="text-[10px] text-slate-400 leading-snug">
                الأشرطة تعرض قيم أول عنصر؛ التعديل يطبَّق على كل المحددين.
              </p>
            )}
            {!hasSelection && (
              <p className="text-[10px] text-slate-400">حدد عنصرًا على الخريطة لتعديل الدوران والمقياس.</p>
            )}
            <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className="font-semibold">الدوران</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={t.rotationDeg}
                disabled={!hasSelection}
                onChange={(e) => onPatchSelected({ rotationDeg: Number(e.target.value) })}
                className="mt-1 w-full accent-slate-900 disabled:opacity-40"
              />
              <span className="text-[10px] text-slate-500">{t.rotationDeg}°</span>
            </label>
            {!hideElementScaleSliders && (
              <>
                <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
                  <span className="font-semibold">عرض العنصر</span>
                  <input
                    type="range"
                    min={0.25}
                    max={30}
                    step={0.05}
                    value={t.scaleX}
                    disabled={!hasSelection}
                    onChange={(e) => onPatchSelected({ scaleX: Number(e.target.value) })}
                    className="mt-1 w-full accent-slate-900 disabled:opacity-40"
                  />
                  <span className="text-[10px] text-slate-500">×{t.scaleX.toFixed(2)}</span>
                </label>
                <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
                  <span className="font-semibold">ارتفاع العنصر</span>
                  <input
                    type="range"
                    min={0.25}
                    max={30}
                    step={0.05}
                    value={t.scaleY}
                    disabled={!hasSelection}
                    onChange={(e) => onPatchSelected({ scaleY: Number(e.target.value) })}
                    className="mt-1 w-full accent-slate-900 disabled:opacity-40"
                  />
                  <span className="text-[10px] text-slate-500">×{t.scaleY.toFixed(2)}</span>
                </label>
              </>
            )}
            <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className="font-semibold">الترتيب الطبقي (Z)</span>
              <input
                type="range"
                min={0}
                max={zMax}
                step={1}
                value={zPosition}
                disabled={!hasSelection}
                onChange={(e) => onChangeSelectedZ(Number(e.target.value))}
                className="mt-1 w-full accent-slate-900 disabled:opacity-40"
              />
              <span className="text-[10px] text-slate-500">
                الحالي: {zPosition} (من 0 إلى {zMax})
              </span>
            </label>
          </div>

          <div className="space-y-2">
            {editableLabelText !== null && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500">نص الملصق</p>
                <input
                  type="text"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                  placeholder="نص الملصق"
                />
                <button
                  type="button"
                  onClick={() => onSaveLabelText(labelDraft)}
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  حفظ النص
                </button>
              </div>
            )}
            {selectedPlotCount === 1 &&
              selectedPlotNumber !== null &&
              selectedPlotNumber !== undefined && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500">الخلية المحددة</p>
                <input
                  type="text"
                  value={selectedPlotDraft}
                  onChange={(e) => setSelectedPlotDraft(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                  placeholder="رقم/اسم الخلية"
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateSelectedPlotNumber(selectedPlotDraft.trim())}
                    className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    حفظ الخلية
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        title: 'حذف الخلية المحددة',
                        message: 'سيتم حذف هذه الخلية من المخطط الحالي نهائيًا.',
                        confirmLabel: 'حذف',
                        run: onDeleteSelectedPlot,
                      })
                    }
                    className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                  >
                    حذف الخلية
                  </button>
                </div>
              </div>
            )}
            {selectedPlotCount > 1 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500">
                  {selectedPlotCount} خلايا محددة
                </p>
                {onSetSelectedPlotsStatus && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-500">تغيير الحالة</p>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const status = e.target.value as PlotStatus
                        if (!status) return
                        e.target.value = ''
                        setPendingAction({
                          title: 'تغيير حالة الوحدات',
                          message: `سيتم تغيير حالة ${selectedPlotCount} وحدة إلى «${status === 'available' ? 'متاحة' : status === 'reserved' ? 'محجوزة' : status === 'sold' ? 'مباعة' : 'محجوزة موظف'}».`,
                          confirmLabel: 'تطبيق',
                          run: () => onSetSelectedPlotsStatus(status),
                        })
                      }}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    >
                      <option value="" disabled>
                        اختر الحالة…
                      </option>
                      <option value="available">متاحة</option>
                      <option value="reserved">محجوزة</option>
                      <option value="sold">مباعة</option>
                      <option value="employee_reserved">محجوزة موظف</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      title: `حذف ${selectedPlotCount} خلية`,
                      message: `سيتم حذف ${selectedPlotCount} خلية من المخطط الحالي نهائيًا.`,
                      confirmLabel: 'حذف',
                      run: onDeleteSelectedPlot,
                    })
                  }
                  className="w-full rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                >
                  حذف الخلايا المحددة
                </button>
              </div>
            )}
          </div>

          {(selectionFontSize != null && onSetSelectionFontSize) ||
          (selectedBlockPlotFontSize != null && onSetBlockPlotFontSize) ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-2">
              <p className="text-[10px] font-bold text-slate-600">الخط والحجم</p>
              {selectionFontSize != null && onSetSelectionFontSize && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-700">
                      {selectionFontSizeLabel}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-slate-600">
                      {selectionFontSize}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetSelectionFontSize(selectionFontSize - 1)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      aria-label={`تصغير ${selectionFontSizeLabel}`}
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={4}
                      max={64}
                      step={1}
                      value={selectionFontSize}
                      onChange={(e) => onSetSelectionFontSize(Number(e.target.value))}
                      className="min-w-0 flex-1 accent-indigo-600"
                      aria-label={selectionFontSizeLabel}
                    />
                    <button
                      type="button"
                      onClick={() => onSetSelectionFontSize(selectionFontSize + 1)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      aria-label={`تكبير ${selectionFontSizeLabel}`}
                    >
                      +
                    </button>
                  </div>
                  {selectionFontSizeHint && (
                    <p className="text-[9px] text-slate-500 leading-snug">{selectionFontSizeHint}</p>
                  )}
                </div>
              )}
              {selectedBlockPlotFontSize != null && onSetBlockPlotFontSize && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-700">حجم خط أرقام الخلايا</span>
                    <span className="text-[10px] font-bold tabular-nums text-slate-600">
                      {selectedBlockPlotFontSize}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetBlockPlotFontSize(selectedBlockPlotFontSize - 1)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      aria-label="تصغير خط أرقام الخلايا"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={4}
                      max={64}
                      step={1}
                      value={selectedBlockPlotFontSize}
                      onChange={(e) => onSetBlockPlotFontSize(Number(e.target.value))}
                      className="min-w-0 flex-1 accent-indigo-600"
                      aria-label="حجم خط أرقام الخلايا"
                    />
                    <button
                      type="button"
                      onClick={() => onSetBlockPlotFontSize(selectedBlockPlotFontSize + 1)}
                      className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      aria-label="تكبير خط أرقام الخلايا"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-snug">
                    أرقام/أسماء الوحدات داخل البلوك — وليس عنوان البلوك.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {selectedBlockLabelHeaderPlacement != null && onSetBlockLabelHeaderPlacement && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-2">
                <p className="text-[10px] font-bold text-slate-700">عنوان البلوك</p>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="block-label-header-placement"
                      checked={selectedBlockLabelHeaderPlacement === 'edge-strip'}
                      onChange={() => onSetBlockLabelHeaderPlacement('edge-strip')}
                      className="accent-indigo-600"
                    />
                    <span className="text-[10px] font-semibold text-slate-700">شريط على الحافة</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="block-label-header-placement"
                      checked={selectedBlockLabelHeaderPlacement === 'grid-intersection'}
                      onChange={() => onSetBlockLabelHeaderPlacement('grid-intersection')}
                      className="accent-indigo-600"
                    />
                    <span className="text-[10px] font-semibold text-slate-700">تقاطع الشبكة</span>
                  </label>
                </div>
                {selectedBlockLabelHeaderPlacement === 'edge-strip' &&
                  selectedBlockLabelStripPercent != null &&
                  onSetBlockLabelStripPercent && (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-700">ارتفاع شريط عنوان البلوك</span>
                      <span className="text-[10px] font-bold tabular-nums text-slate-600">
                        {selectedBlockLabelStripPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={selectedBlockLabelStripPercent}
                      onChange={(e) => onSetBlockLabelStripPercent(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                      aria-label="ارتفاع شريط عنوان البلوك"
                    />
                    <p className="text-[9px] text-slate-500 leading-snug">سُمك الشريط فوق الصف أو العمود الأول.</p>
                  </div>
                )}
                {selectedBlockLabelHeaderPlacement === 'grid-intersection' && (
                  <div className="space-y-2 pt-0.5">
                    {selectedBlockLabelHeaderRowLine != null &&
                      minBlockLabelHeaderRowLine != null &&
                      maxBlockLabelHeaderRowLine != null &&
                      onSetBlockLabelHeaderRowLine &&
                      maxBlockLabelHeaderRowLine > minBlockLabelHeaderRowLine && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-700">
                            {(selectedBlockToolbarRows ?? 0) >= (selectedBlockToolbarCols ?? 0)
                              ? 'موضع على الشريط'
                              : 'خط صف التقاطع'}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums text-slate-600">
                            {selectedBlockLabelHeaderRowLine}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={minBlockLabelHeaderRowLine}
                          max={maxBlockLabelHeaderRowLine}
                          step={1}
                          value={selectedBlockLabelHeaderRowLine}
                          onChange={(e) => onSetBlockLabelHeaderRowLine(Number(e.target.value))}
                          className="w-full accent-indigo-600"
                          aria-label="موضع على الشريط"
                        />
                        <p className="text-[9px] text-slate-500 leading-snug">
                          يحرّك العنوان أفقياً على طول الشريط.
                        </p>
                      </div>
                    )}
                    {selectedBlockLabelHeaderColLine != null &&
                      minBlockLabelHeaderColLine != null &&
                      maxBlockLabelHeaderColLine != null &&
                      onSetBlockLabelHeaderColLine &&
                      maxBlockLabelHeaderColLine > minBlockLabelHeaderColLine && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-700">خط عمود التقاطع</span>
                          <span className="text-[10px] font-bold tabular-nums text-slate-600">
                            {selectedBlockLabelHeaderColLine}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={minBlockLabelHeaderColLine}
                          max={maxBlockLabelHeaderColLine}
                          step={1}
                          value={selectedBlockLabelHeaderColLine}
                          onChange={(e) => onSetBlockLabelHeaderColLine(Number(e.target.value))}
                          className="w-full accent-indigo-600"
                          aria-label="خط عمود التقاطع"
                        />
                        <p className="text-[9px] text-slate-500 leading-snug">
                          يحرّك العنوان عمودياً بين صفوف الشبكة.
                        </p>
                      </div>
                    )}
                    {minBlockLabelHeaderColLine != null &&
                      maxBlockLabelHeaderColLine != null &&
                      minBlockLabelHeaderColLine >= maxBlockLabelHeaderColLine &&
                      (selectedBlockToolbarCols ?? 0) <= 2 && (
                      <p className="text-[9px] text-slate-500 leading-snug rounded-md bg-white/80 px-2 py-1 border border-slate-100">
                        العنوان على فاصل الصفين (بين الشريطين) — ثابت تلقائياً.
                      </p>
                    )}
                    {selectedBlockLabelHeaderIntersectionStyle != null &&
                      onSetBlockLabelHeaderIntersectionStyle && (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="block-label-header-intersection-style"
                            checked={selectedBlockLabelHeaderIntersectionStyle === 'text'}
                            onChange={() => onSetBlockLabelHeaderIntersectionStyle('text')}
                            className="accent-indigo-600"
                          />
                          <span className="text-[10px] font-semibold text-slate-700">نص فقط</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="block-label-header-intersection-style"
                            checked={selectedBlockLabelHeaderIntersectionStyle === 'circle'}
                            onChange={() => onSetBlockLabelHeaderIntersectionStyle('circle')}
                            className="accent-indigo-600"
                          />
                          <span className="text-[10px] font-semibold text-slate-700">دائرة</span>
                        </label>
                      </div>
                    )}
                    {selectedBlockLabelHeaderIntersectionStyle === 'circle' &&
                      selectedBlockLabelHeaderCircleRadiusMapUnits != null &&
                      onSetBlockLabelHeaderCircleRadiusMapUnits && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-700">نصف قطر الدائرة</span>
                          <span className="text-[10px] font-bold tabular-nums text-slate-600">
                            {selectedBlockLabelHeaderCircleRadiusMapUnits}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={4}
                          max={32}
                          step={1}
                          value={selectedBlockLabelHeaderCircleRadiusMapUnits}
                          onChange={(e) =>
                            onSetBlockLabelHeaderCircleRadiusMapUnits(Number(e.target.value))
                          }
                          className="w-full accent-indigo-600"
                          aria-label="نصف قطر الدائرة"
                        />
                        <p className="text-[9px] text-slate-500 leading-snug">
                          حجم ثابت بوحدات الخريطة — لا يتغيّر مع حجم الخلية.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          <button
            type="button"
            onClick={() =>
              setPendingAction({
                title: 'حذف العناصر المحددة',
                message: 'سيتم حذف كل العناصر المحددة من التصميم الحالي.',
                confirmLabel: 'حذف',
                run: onDeleteSelected,
              })
            }
            disabled={!hasSelection}
            className="w-full rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
          >
            حذف المحدد
          </button>

          <div className="border-t border-slate-100 pt-2 space-y-2">
            <p className="text-[10px] font-bold text-slate-500">إضافة إلى الخريطة</p>
            {mapSelectedBlockId ? (
              <>
                {onSelectAllPlotsInBlock && (
                  <button
                    type="button"
                    onClick={onSelectAllPlotsInBlock}
                    className="w-full rounded-lg border border-sky-200 bg-sky-50 py-1.5 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
                  >
                    تحديد كل الوحدات في البلوك
                  </button>
                )}
                <div className="rounded-lg border border-slate-200 p-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-600">إضافة وحدة</p>
                  <p className="text-[9px] text-slate-500 leading-snug">
                    البلوك: <span className="font-semibold text-slate-600">{selectedBlockMenuLabel}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="text"
                      value={newPlotLabel}
                      onChange={(e) => setNewPlotLabel(e.target.value)}
                      className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 col-span-2"
                      placeholder="رقم/اسم الوحدة"
                    />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500">الصف</p>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, addFormStats?.rows ?? 1)}
                        value={newPlotRow}
                        onChange={(e) => setNewPlotRow(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500">العمود</p>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, addFormStats?.cols ?? 1)}
                        value={newPlotCol}
                        onChange={(e) => setNewPlotCol(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPlot(mapSelectedBlockId, newPlotLabel.trim(), newPlotRow, newPlotCol)
                      setNewPlotLabel('')
                    }}
                    className="w-full rounded-md border border-slate-200 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    إضافة وحدة
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 p-2 space-y-2">
                  <p className="text-[10px] font-bold text-slate-600">شبكة البلوك المحدد</p>
                  <p className="text-[9px] text-slate-500 leading-snug">
                    ضبط أبعاد الشبكة أو حذف صف/عمود كامل لهذا البلوك.
                  </p>
                  {selectedBlockToolbarRows != null &&
                    minBlockToolbarRows != null &&
                    onSetBlockToolbarRows && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-700">عدد الصفوف</span>
                        <span className="text-[10px] font-bold tabular-nums text-slate-600">
                          {selectedBlockToolbarRows}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={minBlockToolbarRows}
                        max={BLOCK_GRID_DIM_MAX}
                        step={1}
                        value={selectedBlockToolbarRows}
                        onChange={(e) => onSetBlockToolbarRows(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                        aria-label="عدد الصفوف"
                      />
                    </div>
                  )}
                  {selectedBlockToolbarCols != null &&
                    minBlockToolbarCols != null &&
                    onSetBlockToolbarCols && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-700">عدد الأعمدة</span>
                        <span className="text-[10px] font-bold tabular-nums text-slate-600">
                          {selectedBlockToolbarCols}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={minBlockToolbarCols}
                        max={BLOCK_GRID_DIM_MAX}
                        step={1}
                        value={selectedBlockToolbarCols}
                        onChange={(e) => onSetBlockToolbarCols(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                        aria-label="عدد الأعمدة"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">
                    {addFormStats?.rows ?? 1} صف × {addFormStats?.cols ?? 1} عمود · مشغول {addFormStats.occupiedCells}/
                    {addFormStats.totalCells}
                  </p>
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-slate-500 shrink-0">حذف صف</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, addFormStats?.rows ?? 1)}
                      value={deleteRow}
                      onChange={(e) => setDeleteRow(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      aria-label="رقم الصف للحذف"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          title: 'حذف صف من البلوك',
                          message: `سيتم حذف الصف ${deleteRow} من ${selectedBlockMenuLabel} مع كل خلاياه.`,
                          confirmLabel: 'حذف الصف',
                          run: () => onDeleteBlockRow(mapSelectedBlockId, deleteRow),
                        })
                      }
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                    >
                      احذف الصف
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-slate-500 shrink-0">حذف عمود</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, addFormStats?.cols ?? 1)}
                      value={deleteCol}
                      onChange={(e) => setDeleteCol(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      aria-label="رقم العمود للحذف"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          title: 'حذف عمود من البلوك',
                          message: `سيتم حذف العمود ${deleteCol} من ${selectedBlockMenuLabel} مع كل خلاياه.`,
                          confirmLabel: 'حذف العمود',
                          run: () => onDeleteBlockCol(mapSelectedBlockId, deleteCol),
                        })
                      }
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                    >
                      احذف العمود
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            <p className="text-[10px] font-bold text-slate-600 pt-0.5">عناصر جديدة</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onAddRoad}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة شارع
              </button>
              <button
                type="button"
                onClick={onAddBlock}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة بلوك
              </button>
              <button
                type="button"
                onClick={onAddLabel}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة نص
              </button>
            </div>
            <p className="text-[10px] font-bold text-slate-600">المرافق</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onAddFacility}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة مرفق
              </button>
              <button
                type="button"
                onClick={onStartDrawFacility}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${
                  editorTool === 'drawFacility'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                رسم مرفق
              </button>
            </div>
            {facilityDrawing && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-2 space-y-1.5">
                <p className="text-[10px] font-bold text-indigo-900">
                  {facilityDrawing.stage === 'outer' && facilityDrawing.outer.length === 0
                    ? 'انقر على الخريطة لرسم الحد الخارجي'
                    : facilityDrawing.stage === 'hole'
                      ? 'انقر لرسم فراغ داخلي'
                      : 'الحد الخارجي جاهز — أضف فراغًا أو أنهِ'}
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={onCloseFacilityRing}
                    disabled={facilityDrawing.currentRing.length < 3}
                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    إغلاق الحلقة
                  </button>
                  <button
                    type="button"
                    onClick={onStartFacilityHole}
                    disabled={facilityDrawing.outer.length < 3}
                    className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-40"
                  >
                    إضافة فراغ
                  </button>
                  <button
                    type="button"
                    onClick={onFinishDrawFacility}
                    disabled={facilityDrawing.outer.length < 3}
                    className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    إنهاء
                  </button>
                  <button
                    type="button"
                    onClick={onCancelDrawFacility}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message ?? ''}
        confirmLabel={pendingAction?.confirmLabel ?? 'تأكيد'}
        cancelLabel="إلغاء"
        confirmVariant="danger"
        onConfirm={() => {
          if (!pendingAction) return
          pendingAction.run()
          setPendingAction(null)
        }}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}
