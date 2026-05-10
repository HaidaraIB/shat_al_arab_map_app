/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** When `'true'`, map JSON is not read/written in localStorage (optional). */
  readonly VITE_MAP_DISABLE_LOCAL_STORAGE?: string
}
