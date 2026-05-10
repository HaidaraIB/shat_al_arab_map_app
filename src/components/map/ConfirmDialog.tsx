import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { LoadingSpinner } from '../ui/LoadingIndicator'

type Props = {
  open: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Async confirm: show spinner and block dismissal. */
  confirmLoading?: boolean
  /** Optional richer content shown under title/message. */
  children?: React.ReactNode
  /** Optional icon shown before the title. */
  icon?: React.ReactNode
  /** Disable confirm action when prerequisites are not met. */
  disableConfirm?: boolean
  /** Visual style for confirm action. */
  confirmVariant?: 'primary' | 'amber' | 'danger'
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
  children,
  icon,
  disableConfirm = false,
  confirmLoading = false,
  confirmVariant = 'primary',
}: Props) {
  const busy = confirmLoading

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, busy])

  if (!open) return null

  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500/30 disabled:bg-rose-300 disabled:hover:bg-rose-300'
      : confirmVariant === 'amber'
        ? 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500/30 disabled:bg-amber-300 disabled:hover:bg-amber-300'
        : 'bg-primary text-white hover:opacity-95 focus:ring-primary/30 disabled:bg-indigo-300 disabled:hover:bg-indigo-300'

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
        onClick={busy ? undefined : onCancel}
        disabled={busy}
      />
      <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl shadow-slate-900/10">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-lg font-black text-slate-800">
              {title}
            </h2>
            {message ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p> : null}
          </div>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-row-reverse flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={disableConfirm || busy}
            className={`inline-flex min-w-[100px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {busy ? (
              <LoadingSpinner size="sm" className="border-white/25 border-t-white" label="جاري التنفيذ" />
            ) : null}
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-w-[100px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
