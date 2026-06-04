import type { UserRole } from './database.types'
import { createIsolatedSupabase, getSupabase } from './supabase'

export type CreateEmployeeInput = {
  email: string
  password: string
  name: string
}

export type CreateEmployeeResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

// Creates a new auth user via signUp on an isolated client (so the current
// admin's session is not replaced), then updates the freshly-created profile
// row with the requested name and sales role. Managers are created in Supabase only.
// Requires the caller to currently be authenticated as an admin (RLS will reject
// the profile UPDATE otherwise).
export async function createEmployee({
  email,
  password,
  name,
}: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const isolated = createIsolatedSupabase()
  const main = getSupabase()
  if (!isolated || !main) {
    return { ok: false, error: 'Cloud backend is not configured.' }
  }

  const cleanEmail = email.trim()
  const cleanName = name.trim() || cleanEmail

  const { data, error } = await isolated.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { name: cleanName } },
  })

  if (error) {
    // Free-tier projects throttle confirmation emails (default: 2/hour). When
    // that fails the user record is NOT created either, so nothing to recover.
    // The fix is in the cloud backend dashboard, not here.
    if (/rate limit/i.test(error.message) || /email/i.test(error.message)) {
      return {
        ok: false,
        error:
          'تجاوزت الحد المجاني لإرسال رسائل تأكيد البريد في نظام التوثيق السحابي (افتراضيًا ٢ بالساعة). الحل: من لوحة إدارة النظام السحابي ← Authentication ← Providers ← Email، عطِّل خيار "Confirm email"، ثم أعِد المحاولة. (مع تعطيل التأكيد لن تُرسل أي رسائل ولن يحدث هذا الخطأ.)',
      }
    }
    return { ok: false, error: error.message }
  }
  const userId = data.user?.id
  if (!userId) {
    return {
      ok: false,
      error:
        'تم إنشاء الحساب لكن لم يتم إرجاع المعرّف. تأكَّد من تعطيل تأكيد البريد في نظام التوثيق السحابي.',
    }
  }

  // The handle_new_user trigger already created a profile row. Ensure name and
  // sales role (default trigger sets role='sales').
  const { error: upErr } = await main
    .from('profiles')
    .update({ name: cleanName, role: 'sales' })
    .eq('id', userId)

  if (upErr) {
    return {
      ok: false,
      error: `تم إنشاء الحساب ولكن تعذر تحديث الملف: ${upErr.message}`,
    }
  }

  return { ok: true, userId }
}

export type UpdateEmployeeInput = {
  name: string
  role: UserRole
}

export async function updateEmployee(
  userId: string,
  { name, role }: UpdateEmployeeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const main = getSupabase()
  if (!main) return { ok: false, error: 'Cloud backend is not configured.' }
  const cleanName = name.trim()
  if (!cleanName) return { ok: false, error: 'الاسم مطلوب.' }
  const { error } = await main
    .from('profiles')
    .update({ name: cleanName, role })
    .eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteEmployee(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const main = getSupabase()
  if (!main) return { ok: false, error: 'Cloud backend is not configured.' }
  const { error } = await main.rpc('delete_employee', { target_id: userId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** @deprecated Use updateEmployee instead */
export async function updateEmployeeRole(
  userId: string,
  role: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const main = getSupabase()
  if (!main) return { ok: false, error: 'Cloud backend is not configured.' }
  const { data, error: fetchErr } = await main
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  const currentName = data?.name?.trim() || ''
  return updateEmployee(userId, { name: currentName, role })
}
