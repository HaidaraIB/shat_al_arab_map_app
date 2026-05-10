import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastContextValue = {
  /** Push a toast with variant (default `info`). Returns dismiss id (unused). */
  show: (message: string, variant?: ToastVariant, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<
  ToastVariant,
  { wrap: string; icon: React.ReactNode }
> = {
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />,
  },
  info: {
    wrap: 'border-slate-200 bg-white text-slate-800',
    icon: <Info className="h-5 w-5 shrink-0 text-primary" aria-hidden />,
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />,
  },
  error: {
    wrap: 'border-rose-200 bg-rose-50 text-rose-950',
    icon: <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />,
  },
}

const DEFAULT_DURATION = 3400

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, number>>(new Map())

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id)
    if (t != null) window.clearTimeout(t)
    timersRef.current.delete(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs = DEFAULT_DURATION) => {
      const id = ++idRef.current
      setItems((prev) => [...prev.slice(-4), { id, message, variant }])
      const t = window.setTimeout(() => dismiss(id), durationMs)
      timersRef.current.set(id, t)
      return id
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show(m, 'success', d),
      info: (m, d) => show(m, 'info', d),
      warning: (m, d) => show(m, 'warning', d),
      error: (m, d) => show(m, 'error', d),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (items.length === 0) return null

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 start-4 z-[190] flex max-w-[min(100vw-2rem,24rem)] flex-col gap-2"
      dir="rtl"
      aria-live="polite"
    >
      {items.map((t) => {
        const v = VARIANT_STYLES[t.variant]
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl shadow-slate-900/10 ${v.wrap}`}
          >
            {v.icon}
            <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-lg p-1 text-current opacity-60 transition hover:bg-black/5 hover:opacity-100"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
