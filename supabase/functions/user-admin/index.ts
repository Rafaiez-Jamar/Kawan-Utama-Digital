import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-legacy-migration-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const validRoles = new Set(['sales', 'product', 'delivery', 'admin', 'super-admin'])
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const migrationSecret = Deno.env.get('LEGACY_MIGRATION_SECRET') ?? ''
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

type UserPayload = { action?: string; id?: string; name?: string; email?: string; password?: string; role?: string }

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function listAuthUsers() {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 100) return users
  }
}

async function migrateLegacyUsers() {
  const { data: legacyUsers, error: readError } = await adminClient
    .from('users')
    .select('name, email, password, role, created_at')
    .order('created_at', { ascending: true })
  if (readError) throw readError

  const existingUsers = await listAuthUsers()
  const usersByEmail = new Map(existingUsers.flatMap((user) => user.email ? [[user.email.toLowerCase(), user] as const] : []))
  const migrated: string[] = []
  const failed: { email: string; message: string }[] = []

  for (const legacyUser of legacyUsers ?? []) {
    const email = String(legacyUser.email).trim().toLowerCase()
    const role = String(legacyUser.role)
    if (!validRoles.has(role)) {
      failed.push({ email, message: 'Role atau email legacy tidak valid.' })
      continue
    }

    try {
      let authUser = usersByEmail.get(email)
      if (!authUser) {
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password: String(legacyUser.password),
          email_confirm: true,
          user_metadata: { name: String(legacyUser.name) },
          app_metadata: { role },
        })
        if (error) throw error
        authUser = data.user
        usersByEmail.set(email, authUser)
      } else {
        const { data, error } = await adminClient.auth.admin.updateUserById(authUser.id, {
          user_metadata: { ...authUser.user_metadata, name: String(legacyUser.name) },
          app_metadata: { ...authUser.app_metadata, role },
        })
        if (error) throw error
        authUser = data.user
      }

      const { data: existingProfile, error: profileReadError } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (profileReadError) throw profileReadError
      if (existingProfile && existingProfile.id !== authUser.id) throw new Error('Email sudah terhubung ke profile Auth lain.')

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: authUser.id,
        email,
        name: String(legacyUser.name),
        role,
        created_at: legacyUser.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (profileError) throw profileError
      migrated.push(email)
    } catch (error) {
      failed.push({ email, message: error instanceof Error ? error.message : 'Kesalahan saat migrasi akun.' })
    }
  }

  return { migrated, failed, total: legacyUsers?.length ?? 0 }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method tidak didukung.' }, 405)
  if (!supabaseUrl || !serviceRoleKey) return response({ error: 'Konfigurasi server Supabase belum lengkap.' }, 500)

  let payload: UserPayload
  try {
    payload = await request.json() as UserPayload
  } catch {
    return response({ error: 'Body JSON tidak valid.' }, 400)
  }

  if (payload.action === 'migrate-legacy') {
    if (!migrationSecret || request.headers.get('x-legacy-migration-secret') !== migrationSecret) {
      return response({ error: 'Secret migrasi tidak valid.' }, 401)
    }
    try {
      return response(await migrateLegacyUsers())
    } catch (error) {
      console.error('Legacy user migration failed:', error)
      return response({ error: error instanceof Error ? error.message : 'Migrasi akun gagal.' }, 500)
    }
  }

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return response({ error: 'Sesi admin diperlukan.' }, 401)
  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) return response({ error: 'Sesi tidak valid atau sudah kedaluwarsa.' }, 401)
  const callerRole = authData.user.app_metadata.role
  if (callerRole !== 'super-admin') return response({ error: 'Hanya Super Admin yang dapat mengelola user.' }, 403)

  try {
    if (payload.action === 'create-user') {
      const name = payload.name?.trim()
      const email = payload.email?.trim().toLowerCase()
      if (!name || !email || !payload.password || payload.password.length < 8 || !payload.role || !validRoles.has(payload.role)) {
        return response({ error: 'Nama, email, role valid, dan password minimal 8 karakter diperlukan.' }, 400)
      }
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role: payload.role },
      })
      if (error) throw error
      const { error: profileError } = await adminClient.from('profiles').insert({
        id: data.user.id,
        name,
        email,
        role: payload.role,
      })
      if (profileError) {
        await adminClient.auth.admin.deleteUser(data.user.id)
        throw profileError
      }
      return response({ user: { id: data.user.id, name, email, role: payload.role } }, 201)
    }

    if (payload.action === 'update-user') {
      const id = payload.id
      const name = payload.name?.trim()
      const email = payload.email?.trim().toLowerCase()
      if (!id || !name || !email || !payload.role || !validRoles.has(payload.role) || (payload.password !== undefined && payload.password.length < 8)) {
        return response({ error: 'Informasi user tidak valid.' }, 400)
      }
      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(id)
      if (targetError) throw targetError
      if (target.user.app_metadata.role === 'super-admin' && callerRole !== 'super-admin') {
        return response({ error: 'Hanya Super Admin yang dapat mengubah akun Super Admin.' }, 403)
      }
      const attributes = {
        email,
        user_metadata: { ...target.user.user_metadata, name },
        app_metadata: { ...target.user.app_metadata, role: payload.role },
        ...(payload.password ? { password: payload.password } : {}),
      }
      const { error: updateError } = await adminClient.auth.admin.updateUserById(id, attributes)
      if (updateError) throw updateError
      const { error: profileError } = await adminClient.from('profiles').update({
        email,
        name,
        role: payload.role,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (profileError) throw profileError
      return response({ ok: true })
    }

    if (payload.action === 'delete-user') {
      if (!payload.id) return response({ error: 'ID user diperlukan.' }, 400)
      if (payload.id === authData.user.id) return response({ error: 'Akun yang sedang digunakan tidak dapat dihapus.' }, 400)
      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(payload.id)
      if (targetError) throw targetError
      if (target.user.app_metadata.role === 'super-admin') return response({ error: 'Akun Super Admin tidak dapat dihapus.' }, 403)
      const { error } = await adminClient.auth.admin.deleteUser(payload.id)
      if (error) throw error
      return response({ ok: true })
    }

    return response({ error: 'Action tidak dikenal.' }, 400)
  } catch (error) {
    console.error('User admin action failed:', error)
    return response({ error: error instanceof Error ? error.message : 'Operasi user gagal.' }, 400)
  }
})
