import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let client: SupabaseClient<Database> | null = null

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  return Boolean(url && key)
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL!.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY!.trim()
  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return client
}

// Returns a fresh client that does NOT touch the main session (no persisted
// storage, no token refresh). Use this when an admin needs to create another
// user via signUp without replacing their own session.
export function createIsolatedSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null
  const url = import.meta.env.VITE_SUPABASE_URL!.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY!.trim()
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
