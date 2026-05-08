import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** When true, confirm button shows a subtler danger/warning tone */
  confirmVariant?: 'primary' | 'amber'
}

/** RTL modal aligned with app theme (primary green, slate, rounded cards). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmVariant = 'primary',
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    confirmVariant === 'amber'
      ? 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500/30'
      : 'bg-primary text-white hover:opacity-95 focus:ring-primary/30'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      dir="rtl"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="إغلاق"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl shadow-slate-900/10">
        <h2 id="confirm-dialog-title" className="text-lg font-black text-slate-800">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-6 flex flex-row-reverse flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`min-w-[100px] rounded-xl px-4 py-2.5 text-sm font-black shadow-sm transition focus:outline-none focus:ring-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[100px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300/50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
