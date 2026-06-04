import React, { useEffect, useMemo, useState } from 'react'
import type { ComponentTransform } from '../../types/map'
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
  onUpdateSelectedPlotNumber: (text: string) => void
  onDeleteSelectedPlot: () => void
  onAddRoad: () => void
  onAddBlock: () => void
  onAddFacility: () => void
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
  /** 22–65 = % of one cell step along strip normal; null when no block selected. */
  selectedBlockLabelStripPercent?: number | null
  onSetBlockLabelStripPercent?: (percent: number) => void
  /** When true, hide عرض/ارتفاع العنصر — no visual effect for standalone text / facility caption (font size is used instead). */
  hideElementScaleSliders?: boolean
  /** Map-units font size for the current text selection (plot, road, block title, free label, facility title). */
  selectionFontSize?: number | null
  onSetSelectionFontSize?: (size: number) => void
  /** Facility subtitle only; null when not applicable. */
  selectionSubLabelFontSize?: number | null
  onSetSubLabelFontSize?: (size: number) => void
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
  onUpdateSelectedPlotNumber,
  onDeleteSelectedPlot,
  onAddRoad,
  onAddBlock,
  onAddFacility,
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
  hideElementScaleSliders = false,
  selectionFontSize = null,
  onSetSelectionFontSize,
  selectionSubLabelFontSize = null,
  onSetSubLabelFontSize,
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

        <div className="space-y-1.5">
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
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <p className="text-[10px] font-bold text-slate-500">
            العنصر المحدد
            {selectionCount > 1 ? ` (${selectionCount})` : ''}
          </p>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500">
              النوع: {selectedTypeLabel ?? 'لا يوجد'}
            </p>
            {selectedBlockLabelStripPercent != null && onSetBlockLabelStripPercent && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-700">ارتفاع شريط عنوان البلوك</span>
                  <span className="text-[10px] font-bold tabular-nums text-slate-600">
                    {selectedBlockLabelStripPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={22}
                  max={65}
                  step={1}
                  value={selectedBlockLabelStripPercent}
                  onChange={(e) => onSetBlockLabelStripPercent(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                  aria-label="ارتفاع شريط عنوان البلوك"
                />
                <p className="text-[9px] text-slate-500 leading-snug">سُمك الشريط فوق الصف أو العمود الأول.</p>
              </div>
            )}
            {selectionFontSize != null && onSetSelectionFontSize && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-700">حجم الخط (وحدات الخريطة)</span>
                  <span className="text-[10px] font-bold tabular-nums text-slate-600">{selectionFontSize}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetSelectionFontSize(selectionFontSize - 1)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    aria-label="تصغير الخط"
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
                    aria-label="حجم الخط"
                  />
                  <button
                    type="button"
                    onClick={() => onSetSelectionFontSize(selectionFontSize + 1)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    aria-label="تكبير الخط"
                  >
                    +
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 leading-snug">يُحفظ مع الملف مع التحجيم.</p>
              </div>
            )}
            {selectionSubLabelFontSize != null && onSetSubLabelFontSize && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-700">حجم السطر الثاني (المرفق)</span>
                  <span className="text-[10px] font-bold tabular-nums text-slate-600">{selectionSubLabelFontSize}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetSubLabelFontSize(selectionSubLabelFontSize - 1)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    aria-label="تصغير السطر الثاني"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={4}
                    max={40}
                    step={1}
                    value={selectionSubLabelFontSize}
                    onChange={(e) => onSetSubLabelFontSize(Number(e.target.value))}
                    className="min-w-0 flex-1 accent-indigo-600"
                    aria-label="حجم السطر الثاني"
                  />
                  <button
                    type="button"
                    onClick={() => onSetSubLabelFontSize(selectionSubLabelFontSize + 1)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    aria-label="تكبير السطر الثاني"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
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
            {selectedPlotNumber !== null && selectedPlotNumber !== undefined && (
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
          </div>

          <div className="border-t border-slate-100 pt-2 space-y-2">
            <p className="text-[10px] font-bold text-slate-500">إضافة إلى الخريطة</p>
            {mapSelectedBlockId ? (
              <>
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

                <div className="rounded-lg border border-slate-200 p-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-600">شبكة البلوك المحدد</p>
                  <p className="text-[9px] text-slate-500 leading-snug">
                    توسيع الشبكة أو حذف صف/عمود كامل لهذا البلوك المحدد على الخريطة.
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onGrowBlockGrid(mapSelectedBlockId, 1, 0)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      +صف
                    </button>
                    <button
                      type="button"
                      onClick={() => onGrowBlockGrid(mapSelectedBlockId, 0, 1)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      +عمود
                    </button>
                  </div>
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
                onClick={onAddFacility}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة مرفق
              </button>
              <button
                type="button"
                onClick={onAddLabel}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة نص
              </button>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-2 space-y-2">
            <p className="text-[10px] font-bold text-slate-500">تحويل العنصر المحدد</p>
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
                  max={3}
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
                  max={3}
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
