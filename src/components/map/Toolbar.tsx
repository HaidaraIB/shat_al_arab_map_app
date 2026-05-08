import React, { useEffect, useMemo, useState } from 'react'
import type { ComponentTransform } from '../../types/map'

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
  blockOptions: string[]
  defaultAddPlotBlockId?: string
  /** Per-block grid + occupancy for the add-unit section (toolbar picks row by dropdown). */
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
  /** Writes current map to repo `public/map-default.json` via dev server (see confirmation in handler). */
  onSaveDefaultToProject: () => void
  onImportDisk: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
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
  blockOptions,
  defaultAddPlotBlockId,
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
  onSaveDefaultToProject,
  onImportDisk,
  onZoomIn,
  onZoomOut,
  onFitView,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [labelDraft, setLabelDraft] = useState('')
  const [newPlotBlockId, setNewPlotBlockId] = useState(defaultAddPlotBlockId ?? '')
  const [newPlotLabel, setNewPlotLabel] = useState('')
  const [newPlotRow, setNewPlotRow] = useState(1)
  const [newPlotCol, setNewPlotCol] = useState(1)
  const [deleteRow, setDeleteRow] = useState(1)
  const [deleteCol, setDeleteCol] = useState(1)
  const [selectedPlotDraft, setSelectedPlotDraft] = useState('')
  const t = componentTransform

  const addFormStats = useMemo(() => {
    if (newPlotBlockId && blockAddStatsById?.[newPlotBlockId]) {
      return blockAddStatsById[newPlotBlockId]
    }
    return { rows: 1, cols: 1, occupiedRows: 0, occupiedCols: 0, occupiedCells: 0, totalCells: 1 }
  }, [newPlotBlockId, blockAddStatsById])

  useEffect(() => {
    setLabelDraft(editableLabelText ?? '')
  }, [editableLabelText])

  useEffect(() => {
    if (defaultAddPlotBlockId) setNewPlotBlockId(defaultAddPlotBlockId)
  }, [defaultAddPlotBlockId])

  useEffect(() => {
    setNewPlotRow(1)
    setNewPlotCol(1)
    setDeleteRow(1)
    setDeleteCol(1)
  }, [newPlotBlockId])

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
    <div className="map-toolbar absolute top-4 bottom-4 start-4 z-20 max-w-[280px]">
      <div
        className="h-full overflow-y-scroll overscroll-contain rounded-2xl bg-white/95 shadow-xl border border-slate-200/80 backdrop-blur-md p-3 space-y-3 pointer-events-auto [scrollbar-gutter:stable] [scrollbar-width:thin]"
        onWheel={handleWheelScroll}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-slate-700 leading-snug">جارٍ السحب للتحريك · العجلة للتكبير والتصغير</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
            aria-expanded
          >
            طيّ
          </button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          حرّك المؤشر فوق الوحدات لعرض تفاصيلها ثم انقر لفتح الإجراءات. استخدم زر التحكم لتحديد/إلغاء تحديد العناصر، وبعد التحديد يمكنك سحب العناصر المحددة مباشرة.
          انقر على مساحة فارغة لإلغاء التحديد.
        </p>
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
          <button
            type="button"
            onClick={onExportDisk}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
          >
            تصدير ملف
          </button>
          <button
            type="button"
            onClick={onSaveDefaultToProject}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
           حفظ كتصميم افتراضي
          </button>
          <button
            type="button"
            onClick={onImportDisk}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            استيراد ملف
          </button>
        </div>

        <div className="border-t border-slate-100 pt-2 space-y-2">
          <p className="text-[10px] font-bold text-slate-500">
            العنصر المحدد
            {selectionCount > 1 ? ` (${selectionCount})` : ''}
          </p>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500">
              النوع: {selectedTypeLabel ?? 'لا يوجد'}
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={!hasSelection}
                className="rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
              >
                حذف المحدد
              </button>
              <div className="col-span-2 rounded-lg border border-slate-200 p-2 space-y-1">
                <p className="text-[10px] text-slate-500">إضافة وحدة</p>
                <div className="grid grid-cols-2 gap-1">
                  <select
                    value={newPlotBlockId}
                    onChange={(e) => setNewPlotBlockId(e.target.value)}
                    className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                  >
                    {blockOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newPlotLabel}
                    onChange={(e) => setNewPlotLabel(e.target.value)}
                    className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                    placeholder="رقم/اسم الوحدة"
                  />
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-500">رقم الصف</p>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, addFormStats?.rows ?? 1)}
                      value={newPlotRow}
                      onChange={(e) => setNewPlotRow(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      placeholder="مثال: 1"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-500">رقم العمود</p>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, addFormStats?.cols ?? 1)}
                      value={newPlotCol}
                      onChange={(e) => setNewPlotCol(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                      placeholder="مثال: 1"
                    />
                  </div>
                </div>
                <div className="space-y-0.5 text-[10px] text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>الشبكة المعتمدة: {addFormStats?.rows ?? 1} صف × {addFormStats?.cols ?? 1} عمود</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => newPlotBlockId && onGrowBlockGrid(newPlotBlockId, 1, 0)}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        +صف
                      </button>
                      <button
                        type="button"
                        onClick={() => newPlotBlockId && onGrowBlockGrid(newPlotBlockId, 0, 1)}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        +عمود
                      </button>
                    </div>
                  </div>
                  <span>
                    المشغول فعليًا: {addFormStats.occupiedRows} صف × {addFormStats.occupiedCols} عمود
                    {' · '}
                    خلايا مشغولة: {addFormStats.occupiedCells}/{addFormStats.totalCells}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, addFormStats?.rows ?? 1)}
                    value={deleteRow}
                    onChange={(e) => setDeleteRow(Math.max(1, Number(e.target.value) || 1))}
                    className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                    placeholder="حذف صف"
                  />
                  <button
                    type="button"
                    onClick={() => newPlotBlockId && onDeleteBlockRow(newPlotBlockId, deleteRow)}
                    className="rounded-md border border-rose-200 bg-rose-50 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                  >
                    حذف صف
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, addFormStats?.cols ?? 1)}
                    value={deleteCol}
                    onChange={(e) => setDeleteCol(Math.max(1, Number(e.target.value) || 1))}
                    className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                    placeholder="حذف عمود"
                  />
                  <button
                    type="button"
                    onClick={() => newPlotBlockId && onDeleteBlockCol(newPlotBlockId, deleteCol)}
                    className="rounded-md border border-rose-200 bg-rose-50 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                  >
                    حذف عمود
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!newPlotBlockId}
                  onClick={() => {
                    onAddPlot(newPlotBlockId, newPlotLabel.trim(), newPlotRow, newPlotCol)
                    setNewPlotLabel('')
                  }}
                  className="w-full rounded-md border border-slate-200 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  إضافة وحدة
                </button>
              </div>
              <button
                type="button"
                onClick={onAddRoad}
                className="rounded-lg border border-slate-200 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة شارع
              </button>
              <button
                type="button"
                onClick={onAddBlock}
                className="rounded-lg border border-slate-200 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة بلوك
              </button>
              <button
                type="button"
                onClick={onAddFacility}
                className="rounded-lg border border-slate-200 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة مرفق
              </button>
              <button
                type="button"
                onClick={onAddLabel}
                className="rounded-lg border border-slate-200 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                إضافة نص
              </button>
            </div>
            {editableLabelText !== null && (
              <div className="space-y-1">
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
                <p className="text-[10px] text-slate-500">تحرير الخلية المحددة</p>
                <input
                  type="text"
                  value={selectedPlotDraft}
                  onChange={(e) => setSelectedPlotDraft(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                  placeholder="رقم/اسم الخلية"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateSelectedPlotNumber(selectedPlotDraft.trim())}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    حفظ الخلية
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelectedPlot}
                    className="rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                  >
                    حذف الخلية
                  </button>
                </div>
              </div>
            )}
          </div>
          {selectionCount > 1 && (
            <p className="text-[10px] text-slate-400 leading-snug">
              الأشرطة تعرض قيم أول عنصر؛ التعديل يطبَّق على كل المحددين.
            </p>
          )}
          {!hasSelection && (
            <p className="text-[10px] text-slate-400">حدد عنصرًا على الخريطة لتعديل الدوران والمقياس والإزاحة.</p>
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
          <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
            <span className="font-semibold">إزاحة أفقية</span>
            <input
              type="range"
              min={-400}
              max={400}
              step={2}
              value={t.x}
              disabled={!hasSelection}
              onChange={(e) => onPatchSelected({ x: Number(e.target.value) })}
              className="mt-1 w-full accent-slate-900 disabled:opacity-40"
            />
            <span className="text-[10px] text-slate-500">{t.x} بكسل</span>
          </label>
          <label className={`block text-xs ${hasSelection ? 'text-slate-700' : 'text-slate-400'}`}>
            <span className="font-semibold">إزاحة رأسية</span>
            <input
              type="range"
              min={-400}
              max={400}
              step={2}
              value={t.y}
              disabled={!hasSelection}
              onChange={(e) => onPatchSelected({ y: Number(e.target.value) })}
              className="mt-1 w-full accent-slate-900 disabled:opacity-40"
            />
            <span className="text-[10px] text-slate-500">{t.y} بكسل</span>
          </label>
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
    </div>
  )
}
