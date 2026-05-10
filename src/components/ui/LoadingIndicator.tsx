import React from 'react'

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-9 w-9 border-2',
  lg: 'h-12 w-12 border-[3px]',
} as const

export type LoadingSpinnerProps = {
  size?: keyof typeof sizeClasses
  className?: string
  /** Accessible label; defaults to Arabic loading text. */
  label?: string
}

/** Indigo ring spinner — matches app `--color-primary` / slate surfaces. */
export function LoadingSpinner({ size = 'md', className = '', label = 'جاري التحميل' }: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`inline-block shrink-0 animate-spin rounded-full border-slate-200 border-t-primary ${sizeClasses[size]} ${className}`.trim()}
    >
      <span className="sr-only">{label}</span>
    </span>
  )
}

export type LoadingIndicatorProps = {
  /** Spinner size when no `size` passed to spinner — defaults to `md`. */
  size?: LoadingSpinnerProps['size']
  /** Short status line under the spinner (e.g. full-page bootstrap). */
  message?: string
  /** Full viewport centered block (auth bootstrap). */
  fullScreen?: boolean
  className?: string
  label?: string
}

/**
 * Composes spinner + optional caption. Use `fullScreen` for initial app/auth loading.
 * For buttons, prefer `<LoadingSpinner size="sm" />` inline.
 */
export function LoadingIndicator({
  size = 'md',
  message,
  fullScreen = false,
  className = '',
  label,
}: LoadingIndicatorProps) {
  const content = (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${fullScreen ? '' : 'inline-flex'} ${className}`.trim()}
    >
      <LoadingSpinner size={size} label={label ?? message ?? 'جاري التحميل'} />
      {message ? <p className="text-sm font-bold text-slate-600">{message}</p> : null}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100" dir="rtl">
        {content}
      </div>
    )
  }

  return content
}
