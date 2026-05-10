import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { Eye, EyeOff } from 'lucide-react'
import type { UserRole } from './database.types'
import { getSupabase, isSupabaseConfigured } from './supabase'
import { LoadingIndicator, LoadingSpinner } from '../components/ui/LoadingIndicator'

export type Profile = {
  id: string
  name: string
  role: UserRole
}

type AuthContextValue = {
  loading: boolean
  profileResolving: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  profileError: string | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabase(), [])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [profileResolving, setProfileResolving] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const profileLoadGenRef = useRef(0)
  const bootstrapDoneRef = useRef(false)

  const loadProfile = useCallback(
    async (user: User | null) => {
      const gen = ++profileLoadGenRef.current

      if (!supabase || !user) {
        if (gen !== profileLoadGenRef.current) return
        setProfile(null)
        setProfileError(null)
        setProfileResolving(false)
        return
      }

      setProfileResolving(true)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, role')
          .eq('id', user.id)
          .maybeSingle()
        if (gen !== profileLoadGenRef.current) return
        if (error) {
          console.warn('[auth] profile load error:', error)
          setProfile(null)
          setProfileError(error.message)
          return
        }
        if (!data) {
          setProfile(null)
          setProfileError('NOT_FOUND')
          return
        }
        setProfileError(null)
        setProfile({
          id: data.id,
          name: data.name,
          role: data.role as UserRole,
        })
      } finally {
        if (gen === profileLoadGenRef.current) {
          setProfileResolving(false)
        }
      }
    },
    [supabase],
  )

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setSession(null)
      setProfile(null)
      return
    }

    let cancelled = false
    bootstrapDoneRef.current = false

    const runBootstrap = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(s)
      await loadProfile(s?.user ?? null)
      if (cancelled) return
      bootstrapDoneRef.current = true
      setLoading(false)
    }

    void runBootstrap()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return
      setSession(s)
      if (!bootstrapDoneRef.current) return
      if (s?.user) setProfileResolving(true)
      void loadProfile(s?.user ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: 'Cloud backend is not configured.' }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return { error: error?.message ?? null }
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user ?? null)
  }, [loadProfile, session?.user])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      profileResolving,
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      isAdmin: profile?.role === 'admin',
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, profileResolving, session, profile, profileError, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

function AuthChromeFooter({ maxClassName = 'max-w-md' }: { maxClassName?: string }) {
  const year = new Date().getFullYear()
  return (
    <p
      className={`${maxClassName} w-full text-center text-[10px] font-bold text-slate-400 px-2`}
      role="contentinfo"
    >
      © {year} Shat Al-Arab · All rights reserved · جميع الحقوق محفوظة
    </p>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-100 p-8"
        dir="rtl"
      >
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center space-y-3 w-full">
          <h1 className="text-lg font-black text-slate-900">النظام السحابي غير مُضبط</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            أضف <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> و{' '}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> إلى ملف{' '}
            <code className="rounded bg-slate-100 px-1">.env</code> ثم أعد تشغيل خادم التطوير.
          </p>
        </div>
        <AuthChromeFooter />
      </div>
    )
  }

  const { loading, session, profile, profileResolving } = useAuth()

  if (loading || (session?.user && !profile && profileResolving)) {
    return <LoadingIndicator fullScreen size="lg" message="جاري التحميل…" />
  }

  if (!session?.user) {
    return <LoginScreen />
  }

  if (!profile) {
    return <ProfileNotReady />
  }

  return <>{children}</>
}

function ProfileNotReady() {
  const { profileError, refreshProfile, signOut, user } = useAuth()
  const [pending, setPending] = useState(false)
  const isNotFound = profileError === 'NOT_FOUND'

  const retry = async () => {
    setPending(true)
    try {
      await refreshProfile()
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-100 p-8"
      dir="rtl"
    >
      <div className="max-w-lg w-full rounded-3xl border border-amber-200 bg-amber-50 p-8 space-y-4">
        <h1 className="text-lg font-black text-amber-900 text-center">الملف الشخصي غير جاهز</h1>
        {isNotFound ? (
          <p className="text-sm text-amber-900 leading-relaxed text-center">
            تم إنشاء حسابك في نظام التوثيق السحابي ولكن لا يوجد صف مطابق في جدول <code className="rounded bg-white/60 px-1">profiles</code>.
            شغّل ملف الـ backfill من <code className="rounded bg-white/60 px-1">supabase/migrations/20250510160000_backfill_profiles.sql</code>{' '}
            في محرر SQL، ثم اضغط إعادة المحاولة.
          </p>
        ) : (
          <p className="text-sm text-amber-900 leading-relaxed text-center">
            تعذر قراءة الملف الشخصي من قاعدة البيانات.
          </p>
        )}
        {profileError && profileError !== 'NOT_FOUND' && (
          <pre className="rounded-lg bg-white/70 border border-amber-200 p-3 text-[11px] text-amber-900 whitespace-pre-wrap break-all">
            {profileError}
          </pre>
        )}
        {user && (
          <p className="text-[11px] font-mono text-amber-800/80 text-center break-all">
            user.id: {user.id}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => void retry()}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-sm font-black text-white shadow hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? (
              <>
                <LoadingSpinner size="sm" className="border-white/25 border-t-white" label="جاري المحاولة" />
                جاري المحاولة…
              </>
            ) : (
              'إعادة المحاولة'
            )}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl border border-amber-300 bg-white px-5 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
      <AuthChromeFooter maxClassName="max-w-lg" />
    </div>
  )
}

function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const { error: err } = await signIn(email, password)
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6" dir="rtl">
      <div className="flex w-full max-w-md flex-col items-stretch gap-6">
      <form
        onSubmit={submit}
        className="w-full space-y-5 rounded-[32px] border border-slate-200 bg-white p-10 shadow-2xl"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black text-slate-900">شط العرب</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            تسجيل الدخول
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">البريد</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">كلمة المرور</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 ps-12 pe-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 start-0 flex items-center justify-center w-10 text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-xl"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <p className="text-sm font-bold text-rose-600 text-center">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-black text-white shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
        >
          {pending ? (
            <>
              <LoadingSpinner size="sm" className="border-white/25 border-t-white" label="جاري تسجيل الدخول" />
              جاري الدخول…
            </>
          ) : (
            'دخول'
          )}
        </button>
      </form>
      <AuthChromeFooter />
      </div>
    </div>
  )
}
