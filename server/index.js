import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import express from 'express'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: ['.env.local', '.env'] })

const { Pool } = pg
const app = express()
const port = Number(process.env.API_PORT ?? 3001)
const apiProxySecret = process.env.API_PROXY_SECRET
const database = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'kawan_local_dev',
  user: process.env.PGUSER ?? process.env.USER,
  password: process.env.PGPASSWORD,
  max: 10,
})
const roles = new Set(['sales', 'product', 'delivery', 'admin', 'super-admin'])
const sessionCookie = 'kawan_local_session'
const sessionDurationMs = 12 * 60 * 60 * 1000
const loginAttempts = new Map()
const moduleAccess = {
  sales: new Set(['product-requests', 'rab', 'sph', 'delivery', 'funnel']),
  product: new Set(['product-requests', 'rab', 'sph', 'delivery']),
  delivery: new Set(['delivery', 'sph', 'rab']),
  admin: new Set(['product-requests', 'rab', 'sph', 'delivery', 'funnel']),
  'super-admin': new Set(['product-requests', 'rab', 'sph', 'delivery', 'funnel']),
}
const mutableMomFields = [
  'created_by_email', 'created_by_name', 'status', 'client_name', 'meeting_date',
  'meeting_time', 'summary', 'notes', 'action_items', 'pic_name', 'deadline',
  'updated_at', 'published_at',
]
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: sessionDurationMs,
}

app.disable('x-powered-by')
app.use(express.json({ limit: '10mb' }))
app.use((request, response, next) => {
  if (process.env.NODE_ENV !== 'production') return next()
  if (!apiProxySecret) return response.status(503).json({ error: 'API proxy belum dikonfigurasi.' })
  if (!hasValidProxySecret(request.get('x-api-proxy-secret'))) {
    return response.status(403).json({ error: 'Akses API langsung tidak diizinkan.' })
  }
  next()
})

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function hasValidProxySecret(value) {
  if (typeof value !== 'string' || !apiProxySecret) return false
  const provided = Buffer.from(value)
  const expected = Buffer.from(apiProxySecret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function readCookie(request, name) {
  const entry = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, created_at: row.created_at }
}

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

async function authenticate(request, _response, next) {
  try {
    const token = readCookie(request, sessionCookie)
    if (!token) fail(401, 'Sesi login diperlukan.')
    const { rows } = await database.query(
      `SELECT a.id, a.name, a.email, a.role, a.created_at, s.token_hash
       FROM local_sessions s
       JOIN local_accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    )
    if (!rows[0]) fail(401, 'Sesi sudah kedaluwarsa. Silakan login kembali.')
    request.user = publicUser(rows[0])
    request.sessionHash = rows[0].token_hash
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(...allowedRoles) {
  return (request, _response, next) => {
    if (!allowedRoles.includes(request.user.role)) return next(Object.assign(new Error('Akses tidak diizinkan.'), { status: 403 }))
    next()
  }
}

function canReadWorkspace(user, row) {
  if (!moduleAccess[user.role]?.has(row.module)) return false
  if (user.role === 'admin' || user.role === 'super-admin' || user.role === 'product' || user.role === 'delivery') return true
  const ownerEmail = row.owner_email ?? row.payload?.ownerEmail ?? row.payload?.owner_email
  return typeof ownerEmail === 'string' && ownerEmail.toLowerCase() === user.email.toLowerCase()
}

function canWriteWorkspace(user, row) {
  if (!canReadWorkspace(user, row)) return false
  if (user.role === 'sales') return !row.owner_email || row.owner_email.toLowerCase() === user.email.toLowerCase()
  if (user.role === 'delivery') return row.module === 'delivery'
  return true
}

async function initialize() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS public.local_accounts (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      name text NOT NULL,
      role text NOT NULL CHECK (role IN ('sales', 'product', 'delivery', 'admin', 'super-admin')),
      password_hash text NOT NULL,
      monthly_sales_target numeric(16, 2) NOT NULL DEFAULT 0 CHECK (monthly_sales_target >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.local_accounts
      ADD COLUMN IF NOT EXISTS monthly_sales_target numeric(16, 2) NOT NULL DEFAULT 0
      CHECK (monthly_sales_target >= 0);
    CREATE UNIQUE INDEX IF NOT EXISTS local_accounts_email_lower_idx ON public.local_accounts (lower(email));
    CREATE TABLE IF NOT EXISTS public.local_sessions (
      token_hash text PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES public.local_accounts(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS local_sessions_expiry_idx ON public.local_sessions (expires_at);
    INSERT INTO public.local_accounts (id, email, name, role, password_hash, created_at)
    SELECT u.id, lower(u.email), COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''), p.name, u.email),
           u.raw_app_meta_data->>'role', u.encrypted_password, COALESCE(p.created_at, u.created_at)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.email IS NOT NULL
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password <> ''
      AND u.raw_app_meta_data->>'role' = ANY(ARRAY['sales', 'product', 'delivery', 'admin', 'super-admin'])
    ON CONFLICT (id) DO NOTHING;
    DELETE FROM public.local_sessions WHERE expires_at <= now();
  `)
}

app.get('/api/health', async (_request, response, next) => {
  try {
    await database.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const now = Date.now()
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const address = request.get('x-proxy-client-ip') || request.ip || 'local'
    const attemptKey = `${address}:${email || 'unknown'}`
    const attempts = loginAttempts.get(attemptKey)
    if (attempts && attempts.expiresAt > now && attempts.count >= 10) fail(429, 'Terlalu banyak percobaan login. Tunggu satu menit lalu coba lagi.')
    if (attempts && attempts.expiresAt <= now) loginAttempts.delete(attemptKey)

    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!email || !password) fail(400, 'Email dan password wajib diisi.')
    const { rows } = await database.query(
      'SELECT id, email, name, role, password_hash, created_at FROM local_accounts WHERE lower(email) = $1',
      [email],
    )
    const account = rows[0]
    if (!account || !roles.has(account.role) || !(await bcrypt.compare(password, account.password_hash))) {
      const current = loginAttempts.get(attemptKey)
      loginAttempts.set(attemptKey, { count: (current?.count ?? 0) + 1, expiresAt: current?.expiresAt > now ? current.expiresAt : now + 60_000 })
      fail(401, 'Email atau password tidak sesuai.')
    }

    loginAttempts.delete(attemptKey)
    const token = randomBytes(32).toString('base64url')
    await database.query(
      'INSERT INTO local_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
      [hashToken(token), account.id, new Date(now + sessionDurationMs)],
    )
    response.cookie(sessionCookie, token, cookieOptions).json({ user: publicUser(account) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/session', async (request, response, next) => {
  try {
    const token = readCookie(request, sessionCookie)
    if (!token) return response.json({ user: null })
    const { rows } = await database.query(
      `SELECT a.id, a.name, a.email, a.role, a.created_at
       FROM local_sessions s
       JOIN local_accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    )
    if (!rows[0]) {
      response.clearCookie(sessionCookie, { ...cookieOptions, maxAge: undefined })
      return response.json({ user: null })
    }
    response.json({ user: publicUser(rows[0]) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', authenticate, async (request, response, next) => {
  try {
    await database.query('DELETE FROM local_sessions WHERE token_hash = $1', [request.sessionHash])
    response.clearCookie(sessionCookie, { ...cookieOptions, maxAge: undefined }).json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/profiles', authenticate, requireRole('admin', 'super-admin'), async (_request, response, next) => {
  try {
    const { rows } = await database.query('SELECT id, name, email, role, created_at FROM local_accounts ORDER BY name')
    response.json(rows)
  } catch (error) {
    next(error)
  }
})

app.get('/api/users', authenticate, requireRole('super-admin'), async (_request, response, next) => {
  try {
    const { rows } = await database.query('SELECT id, name, email, role, created_at FROM local_accounts ORDER BY created_at')
    response.json(rows)
  } catch (error) {
    next(error)
  }
})

app.post('/api/users', authenticate, requireRole('super-admin'), async (request, response, next) => {
  try {
    const { action, id, name, email, password, role } = request.body ?? {}
    if (action === 'create-user') {
      const cleanName = typeof name === 'string' ? name.trim() : ''
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
      if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || typeof password !== 'string' || password.length < 8 || !roles.has(role)) {
        fail(400, 'Nama, email valid, role, dan password minimal 8 karakter diperlukan.')
      }
      const { rows } = await database.query(
        'INSERT INTO local_accounts (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, created_at',
        [randomUUID(), cleanEmail, cleanName, role, await bcrypt.hash(password, 12)],
      )
      response.status(201).json({ user: publicUser(rows[0]) })
      return
    }

    if (action === 'update-user') {
      if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !roles.has(role) || (password !== undefined && (typeof password !== 'string' || password.length < 8))) {
        fail(400, 'Informasi user tidak valid.')
      }
      if (id === request.user.id && role !== 'super-admin') fail(400, 'Role akun Super Admin yang sedang login tidak dapat diubah.')
      const values = [id, name.trim(), email.trim().toLowerCase(), role]
      const passwordSql = password ? ', password_hash = $5' : ''
      if (password) values.push(await bcrypt.hash(password, 12))
      const { rows } = await database.query(
        `UPDATE local_accounts SET name = $2, email = $3, role = $4, updated_at = now()${passwordSql}
         WHERE id = $1 RETURNING id, name, email, role, created_at`,
        values,
      )
      if (!rows[0]) fail(404, 'User tidak ditemukan.')
      response.json({ user: publicUser(rows[0]) })
      return
    }

    if (action === 'delete-user') {
      if (typeof id !== 'string' || !id) fail(400, 'ID user diperlukan.')
      if (id === request.user.id) fail(400, 'Akun yang sedang digunakan tidak dapat dihapus.')
      const result = await database.query("DELETE FROM local_accounts WHERE id = $1 AND role <> 'super-admin'", [id])
      if (!result.rowCount) fail(404, 'User tidak ditemukan atau akun Super Admin dilindungi.')
      response.json({ ok: true })
      return
    }

    fail(400, 'Aksi pengelolaan user tidak dikenal.')
  } catch (error) {
    next(error)
  }
})

function requestedPeriod(request) {
  const start = typeof request.query.start === 'string' ? new Date(request.query.start) : null
  const end = typeof request.query.end === 'string' ? new Date(request.query.end) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    fail(400, 'Periode target bulanan tidak valid.')
  }
  return { start, end }
}

async function wonAmountForSales(email, start, end) {
  const { rows } = await database.query(
    `SELECT payload FROM public.workspace_data
     WHERE module = 'sph'
       AND lower(COALESCE(NULLIF(owner_email, ''), payload->>'ownerEmail', payload->>'owner_email', '')) = lower($1)`,
    [email],
  )
  return rows.reduce((total, { payload }) => {
    if (!payload || payload.status !== 'WIN') return total
    const wonAt = new Date(payload.wonAt ?? payload.createdAt ?? '')
    if (Number.isNaN(wonAt.getTime()) || wonAt < start || wonAt >= end) return total
    const gross = Array.isArray(payload.items)
      ? payload.items.reduce((sum, item) => {
        const quantity = Number(item.quantity)
        const unitPrice = Number(item.unitPrice)
        return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? sum + quantity * unitPrice : sum
      }, 0)
      : 0
    const discount = Number(payload.discount)
    const discountRate = Number.isFinite(discount) ? Math.min(100, Math.max(0, discount)) : 0
    return total + gross * (1 - discountRate / 100)
  }, 0)
}

app.get('/api/sales-target', authenticate, requireRole('sales'), async (request, response, next) => {
  try {
    const { start, end } = requestedPeriod(request)
    const { rows } = await database.query(
      'SELECT monthly_sales_target FROM public.local_accounts WHERE id = $1',
      [request.user.id],
    )
    if (!rows[0]) fail(404, 'Akun Sales tidak ditemukan.')
    const achieved = await wonAmountForSales(request.user.email, start, end)
    response.json({ target: Number(rows[0].monthly_sales_target), achieved, start: start.toISOString(), end: end.toISOString() })
  } catch (error) {
    next(error)
  }
})

app.get('/api/sales-targets', authenticate, requireRole('admin', 'super-admin'), async (request, response, next) => {
  try {
    const { start, end } = requestedPeriod(request)
    const { rows } = await database.query(
      `SELECT id, name, email, monthly_sales_target
       FROM public.local_accounts WHERE role = 'sales' ORDER BY name`,
    )
    const targets = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      target: Number(row.monthly_sales_target),
      achieved: await wonAmountForSales(row.email, start, end),
    })))
    response.json(targets)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/sales-targets/:id', authenticate, requireRole('admin', 'super-admin'), async (request, response, next) => {
  try {
    const target = request.body?.target
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0 || target > 1_000_000_000_000_000) {
      fail(400, 'Target harus berupa nominal Rupiah nol atau lebih.')
    }
    const { rows } = await database.query(
      `UPDATE public.local_accounts SET monthly_sales_target = $2, updated_at = now()
       WHERE id = $1 AND role = 'sales'
       RETURNING id, name, email, monthly_sales_target`,
      [request.params.id, target],
    )
    if (!rows[0]) fail(404, 'Akun Sales tidak ditemukan.')
    response.json({ id: rows[0].id, name: rows[0].name, email: rows[0].email, target: Number(rows[0].monthly_sales_target) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/attendance', authenticate, async (request, response, next) => {
  try {
    const isPrivileged = ['admin', 'super-admin'].includes(request.user.role)
    const values = []
    let where = ''
    if (!isPrivileged) {
      values.push(request.user.email)
      where = 'WHERE lower(user_email) = lower($1)'
    }
    if (request.query.start) {
      values.push(request.query.start)
      where += `${where ? ' AND' : 'WHERE'} created_at >= $${values.length}`
    }
    if (request.query.end) {
      values.push(request.query.end)
      where += `${where ? ' AND' : 'WHERE'} created_at < $${values.length}`
    }
    const photoColumn = isPrivileged && request.query.photos === '1' ? ', photo_data' : ''
    const { rows } = await database.query(
      `SELECT id, user_name, user_email, location_label, latitude, longitude, created_at${photoColumn}
       FROM public.attendance ${where} ORDER BY created_at DESC LIMIT 1000`,
      values,
    )
    response.json(rows)
  } catch (error) {
    next(error)
  }
})

app.get('/api/attendance/:id/photo', authenticate, async (request, response, next) => {
  try {
    const values = [request.params.id]
    let access = ''
    if (!['admin', 'super-admin'].includes(request.user.role)) {
      values.push(request.user.email)
      access = ' AND lower(user_email) = lower($2)'
    }
    const { rows } = await database.query(
      `SELECT photo_data FROM public.attendance WHERE id = $1${access}`,
      values,
    )
    if (!rows[0]) fail(404, 'Data foto absensi tidak ditemukan.')
    response.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.post('/api/attendance', authenticate, async (request, response, next) => {
  try {
    const { photo_data, location_label, latitude, longitude, created_at } = request.body ?? {}
    if (typeof photo_data !== 'string' || !photo_data.startsWith('data:image/')) fail(400, 'Foto absensi tidak valid.')
    const { rows } = await database.query(
      `INSERT INTO public.attendance (user_name, user_email, photo_data, location_label, latitude, longitude, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
       RETURNING id, created_at`,
      [request.user.name, request.user.email, photo_data, location_label ?? null, latitude ?? null, longitude ?? null, created_at ?? null],
    )
    response.status(201).json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.patch('/api/attendance/:id/photo', authenticate, async (request, response, next) => {
  try {
    const photo = request.body?.photo_data
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) fail(400, 'Foto absensi tidak valid.')
    const values = [request.params.id, photo]
    let access = ''
    if (!['admin', 'super-admin'].includes(request.user.role)) {
      values.push(request.user.email)
      access = ' AND lower(user_email) = lower($3)'
    }
    const result = await database.query(
      `UPDATE public.attendance SET photo_data = $2 WHERE id = $1${access}`,
      values,
    )
    if (!result.rowCount) fail(404, 'Data absensi tidak ditemukan atau tidak dapat diubah.')
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/presence', authenticate, requireRole('admin', 'super-admin'), async (_request, response, next) => {
  try {
    const { rows } = await database.query(
      `SELECT session_id, user_name, user_email, role, login_at, last_seen, is_online
       FROM public.user_presence ORDER BY last_seen DESC LIMIT 500`,
    )
    response.json(rows)
  } catch (error) {
    next(error)
  }
})

app.put('/api/presence/:sessionId', authenticate, async (request, response, next) => {
  try {
    if (typeof request.params.sessionId !== 'string' || request.params.sessionId.length > 100) fail(400, 'ID sesi tidak valid.')
    const online = request.body?.is_online === true
    await database.query(
      `INSERT INTO public.user_presence (session_id, user_name, user_email, role, login_at, last_seen, is_online)
       VALUES ($1, $2, $3, $4, now(), now(), $5)
       ON CONFLICT (session_id) DO UPDATE SET user_name = EXCLUDED.user_name, user_email = EXCLUDED.user_email,
         role = EXCLUDED.role, last_seen = now(), is_online = EXCLUDED.is_online`,
      [request.params.sessionId, request.user.name, request.user.email, request.user.role, online],
    )
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/mom', authenticate, async (request, response, next) => {
  try {
    const values = []
    const filters = []
    if (request.user.role === 'sales') {
      values.push(request.user.email)
      filters.push(`lower(created_by_email) = lower($${values.length})`)
    } else {
      filters.push("status = 'PUBLISHED'")
    }
    if (request.query.id) {
      values.push(request.query.id)
      filters.push(`id = $${values.length}`)
    }
    const { rows } = await database.query(
      `SELECT * FROM public.mom WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`,
      values,
    )
    response.json(request.query.id ? rows[0] ?? null : rows)
  } catch (error) {
    next(error)
  }
})

app.post('/api/mom', authenticate, async (request, response, next) => {
  try {
    const body = request.body ?? {}
    if (request.user.role !== 'sales' || typeof body.created_by_email !== 'string' || body.created_by_email.toLowerCase() !== request.user.email.toLowerCase()) fail(403, 'Akun ini tidak dapat membuat MOM untuk user lain.')
    if (!body.client_name || !body.meeting_date) fail(400, 'Nama client dan tanggal meeting wajib diisi.')
    const baseFields = ['created_by_email', 'created_by_name', 'status', 'client_name', 'meeting_date']
    const optionalFields = mutableMomFields.filter((field) => body[field] !== undefined && !baseFields.includes(field))
    const columns = ['created_by_email', 'created_by_name', 'status', 'client_name', 'meeting_date', ...optionalFields, 'created_at']
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
    const { rows } = await database.query(
      `INSERT INTO public.mom (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      columns.map((field) => field === 'created_by_email' ? request.user.email
        : field === 'created_by_name' ? request.user.name
          : field === 'status' ? body.status ?? 'DRAFT'
            : field === 'created_at' ? body.created_at ?? new Date().toISOString()
          : ['meeting_time', 'deadline', 'summary', 'notes', 'action_items', 'pic_name'].includes(field) && body[field] === '' ? null
            : body[field] ?? null),
    )
    response.status(201).json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.patch('/api/mom/:id', authenticate, async (request, response, next) => {
  try {
    const values = [request.params.id]
    let access = ''
    if (request.user.role === 'sales') {
      values.push(request.user.email)
      access = ` AND lower(created_by_email) = lower($${values.length})`
    } else if (!['admin', 'super-admin'].includes(request.user.role)) {
      fail(403, 'Akun ini tidak dapat mengubah MOM.')
    }
    const fields = Object.keys(request.body ?? {}).filter((field) => mutableMomFields.includes(field) && !['created_by_email', 'created_by_name'].includes(field))
    if (!fields.length) fail(400, 'Tidak ada perubahan MOM yang valid.')
    const assignments = fields.map((field) => {
      values.push(request.body[field])
      return `${field} = $${values.length}`
    })
    const { rows } = await database.query(
      `UPDATE public.mom SET ${assignments.join(', ')} WHERE id = $1${access} RETURNING *`,
      values,
    )
    if (!rows[0]) fail(404, 'MOM tidak ditemukan atau tidak dapat diubah.')
    response.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.delete('/api/mom/:id', authenticate, async (request, response, next) => {
  try {
    if (!['admin', 'super-admin'].includes(request.user.role)) fail(403, 'Hanya admin yang dapat menghapus MOM.')
    const result = await database.query('DELETE FROM public.mom WHERE id = $1', [request.params.id])
    if (!result.rowCount) fail(404, 'MOM tidak ditemukan.')
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/workspace', authenticate, async (request, response, next) => {
  try {
    const requested = typeof request.query.modules === 'string' ? request.query.modules.split(',').filter(Boolean) : []
    if (!requested.length || requested.some((module) => !Object.hasOwn(moduleAccess, request.user.role) || !moduleAccess[request.user.role].has(module))) {
      fail(400, 'Daftar modul tidak valid atau tidak diizinkan.')
    }
    let { rows } = await database.query(
      `SELECT module, record_id, owner_email, target_team, payload
       FROM public.workspace_data WHERE module = ANY($1::text[])`,
      [requested],
    )
    rows = rows.filter((row) => canReadWorkspace(request.user, row))
    if (request.query.light === '1') {
      rows = rows.map((row) => {
        if (row.module !== 'delivery' || !row.payload || typeof row.payload !== 'object') return row
        const { proofPhoto: _proofPhoto, locationHistory: _locationHistory, ...payload } = row.payload
        return { ...row, payload }
      })
    }
    response.json(rows)
  } catch (error) {
    next(error)
  }
})

app.get('/api/workspace/:module/:recordId', authenticate, async (request, response, next) => {
  try {
    const { rows } = await database.query(
      'SELECT module, record_id, owner_email, target_team, payload FROM public.workspace_data WHERE module = $1 AND record_id = $2',
      [request.params.module, request.params.recordId],
    )
    const row = rows[0]
    if (!row || !canReadWorkspace(request.user, row)) return response.json(null)
    response.json(row)
  } catch (error) {
    next(error)
  }
})

app.put('/api/workspace', authenticate, async (request, response, next) => {
  try {
    const { module, record_id, owner_email, target_team, payload } = request.body ?? {}
    const recordId = typeof record_id === 'string' || (typeof record_id === 'number' && Number.isSafeInteger(record_id))
      ? String(record_id)
      : ''
    const row = { module, record_id: recordId, owner_email: owner_email ?? null, target_team: target_team ?? null, payload }
    if (typeof module !== 'string' || !recordId || !payload || typeof payload !== 'object' || !canWriteWorkspace(request.user, row)) {
      fail(403, 'Perubahan data workspace tidak diizinkan.')
    }
    if (request.user.role === 'sales' && typeof payload.ownerEmail === 'string' && payload.ownerEmail.toLowerCase() !== request.user.email.toLowerCase()) {
      fail(403, 'Data workspace ini dimiliki user lain.')
    }
    const existing = await database.query(
      'SELECT module, record_id, owner_email, target_team, payload FROM public.workspace_data WHERE module = $1 AND record_id = $2',
      [module, recordId],
    )
    if (existing.rows[0] && !canWriteWorkspace(request.user, existing.rows[0])) fail(403, 'Data workspace ini dimiliki user lain.')
    const ownerEmail = request.user.role === 'sales' ? request.user.email : row.owner_email
    const { rows } = await database.query(
      `INSERT INTO public.workspace_data (module, record_id, owner_email, target_team, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (module, record_id) DO UPDATE SET owner_email = EXCLUDED.owner_email,
         target_team = EXCLUDED.target_team, payload = EXCLUDED.payload, updated_at = now()
      WHERE workspace_data.module <> 'sph'
         OR workspace_data.payload->>'status' <> 'WIN'
         OR EXCLUDED.payload->>'status' = 'WIN'
      RETURNING module, record_id, owner_email, target_team, payload`,
      [module, recordId, ownerEmail, row.target_team, JSON.stringify(payload)],
    )
    if (!rows[0]) fail(409, 'Status WIN bersifat permanen dan tidak dapat diubah.')
    response.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.delete('/api/workspace/:module/:recordId', authenticate, async (request, response, next) => {
  try {
    const { rows } = await database.query(
      'SELECT module, record_id, owner_email, target_team, payload FROM public.workspace_data WHERE module = $1 AND record_id = $2',
      [request.params.module, request.params.recordId],
    )
    if (!rows[0] || !canWriteWorkspace(request.user, rows[0])) fail(404, 'Data tidak ditemukan atau tidak dapat dihapus.')
    await database.query('DELETE FROM public.workspace_data WHERE module = $1 AND record_id = $2', [request.params.module, request.params.recordId])
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/rab/next-number', authenticate, async (request, response, next) => {
  try {
    const { businessType, date } = request.body ?? {}
    if (!['B2B', 'B2G'].includes(businessType) || typeof date !== 'string') fail(400, 'Jenis bisnis atau tanggal tidak valid.')
    const { rows } = await database.query(
      'SELECT public.next_rab_number($1, $2::date) AS number',
      [businessType, date],
    )
    response.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  if (error.code === '23505') return response.status(409).json({ error: 'Email atau data dengan ID tersebut sudah digunakan.' })
  if (error.code === '23503') return response.status(409).json({ error: 'Data masih terhubung dengan catatan lain dan tidak dapat dihapus.' })
  if (error.code === '23514') return response.status(400).json({ error: 'Data tidak memenuhi aturan database.' })
  const status = Number(error.status) || 500
  if (status >= 500) console.error('Local API request failed:', error)
  response.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan pada server lokal.' : error.message })
})

initialize().then(() => {
  if (process.env.NODE_ENV === 'production' && !apiProxySecret) {
    throw new Error('API_PROXY_SECRET wajib disetel sebelum API dijalankan dalam mode production.')
  }
  app.listen(port, '127.0.0.1', () => console.log(`Local API listening on http://127.0.0.1:${port}`))
}).catch((error) => {
  console.error('Local API could not start:', error)
  process.exitCode = 1
})
