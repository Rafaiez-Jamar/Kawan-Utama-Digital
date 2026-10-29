export type LocalRole = 'sales' | 'product' | 'delivery' | 'admin' | 'super-admin'
export type LocalUser = { id: string; name: string; email: string; role: LocalRole; created_at?: string }
export type SalesTarget = { id: string; name: string; email: string; target: number; achieved: number }
export type SalesTargetProgress = { target: number; achieved: number; start: string; end: string }
export type WorkspaceModule = 'product-requests' | 'rab' | 'sph' | 'delivery' | 'funnel'
export type WorkspaceRow<T = unknown> = {
  module: WorkspaceModule
  record_id: string
  owner_email: string | null
  target_team: string | null
  payload: T
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const contentType = response.headers.get('content-type') ?? ''
  const data: unknown = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Local API merespons HTTP ${response.status}.`
    throw new Error(message)
  }
  return data as T
}

export const localApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, 'POST', body),
  put: <T>(path: string, body: unknown) => request<T>(path, 'PUT', body),
  patch: <T>(path: string, body: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
  login: (email: string, password: string) => request<{ user: LocalUser }>('/auth/login', 'POST', { email, password }),
  logout: () => request<{ ok: boolean }>('/auth/logout', 'POST', {}),
  session: () => request<{ user: LocalUser | null }>('/auth/session'),
  profiles: () => request<LocalUser[]>('/profiles'),
  users: () => request<LocalUser[]>('/users'),
  manageUser: (payload: Record<string, string>) => request('/users', 'POST', payload),
  salesTarget: (start: string, end: string) => request<SalesTargetProgress>(`/sales-target?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  salesTargets: (start: string, end: string) => request<SalesTarget[]>(`/sales-targets?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  updateSalesTarget: (id: string, target: number) => request<SalesTarget>(`/sales-targets/${encodeURIComponent(id)}`, 'PATCH', { target }),
  attendance: (start: string, end: string, includePhotos = false) => request<Array<Record<string, unknown>>>(`/attendance?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${includePhotos ? '&photos=1' : ''}`),
  attendancePhoto: (id: string) => request<{ photo_data: string | null }>(`/attendance/${encodeURIComponent(id)}/photo`),
  saveAttendance: (payload: Record<string, unknown>) => request<{ id: string; created_at: string }>('/attendance', 'POST', payload),
  updateAttendancePhoto: (id: string, photo_data: string) => request<{ ok: boolean }>(`/attendance/${encodeURIComponent(id)}/photo`, 'PATCH', { photo_data }),
  presence: () => request<Array<Record<string, unknown>>>('/presence'),
  updatePresence: (sessionId: string, is_online: boolean) => request<{ ok: boolean }>(`/presence/${encodeURIComponent(sessionId)}`, 'PUT', { is_online }),
  mom: <T>(id?: number) => request<T>(`/mom${id === undefined ? '' : `?id=${encodeURIComponent(id)}`}`),
  createMom: <T>(payload: Record<string, unknown>) => request<T>('/mom', 'POST', payload),
  updateMom: (id: number, payload: Record<string, unknown>) => request(`/mom/${id}`, 'PATCH', payload),
  deleteMom: (id: number) => request<{ ok: boolean }>(`/mom/${id}`, 'DELETE'),
  nextRabNumber: (businessType: 'B2B' | 'B2G', date: string) => request<{ number: string }>('/rab/next-number', 'POST', { businessType, date }),
}

export async function loadWorkspaceRows(modules: WorkspaceModule[]) {
  const query = encodeURIComponent(modules.join(','))
  return request<WorkspaceRow[]>(`/workspace?modules=${query}`)
}

export async function loadDeliveryWorkspaceRows(modules: WorkspaceModule[]) {
  const query = encodeURIComponent(modules.join(','))
  return request<WorkspaceRow[]>(`/workspace?modules=${query}&light=1`)
}

export async function loadWorkspaceRow(module: WorkspaceModule, recordId: string) {
  return request<WorkspaceRow | null>(`/workspace/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`)
}

export async function saveWorkspaceRow<T>(row: WorkspaceRow<T>) {
  await request<WorkspaceRow<T>>('/workspace', 'PUT', row)
}

export async function deleteWorkspaceRow(module: WorkspaceModule, recordId: string) {
  await request<{ ok: boolean }>(`/workspace/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`, 'DELETE')
}
