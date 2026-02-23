export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

function getToken(): string | null {
  return localStorage.getItem('ticket_access')
}

export function decodeToken(): Record<string, any> | null {
  const token = getToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch (e) {
    return null
  }
}

export function getCurrentUser(): { id?: number; username?: string; email?: string } | null {
  const payload = decodeToken()
  if (!payload) return null
  return {
    id: payload.user_id ?? payload.sub ?? undefined,
    username: payload.username ?? payload.email ?? undefined,
    email: payload.email ?? undefined,
  }
}

function setTokens(access: string, _refresh?: string) {
  localStorage.setItem('ticket_access', access)
}

export function clearAuth() {
  localStorage.removeItem('ticket_access')
}

export async function login(emailOrUser: string, password: string) {
  const r = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOrUser, username: emailOrUser, password }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { error?: string }).error || 'Error al iniciar sesión')
  }
  const d = (await r.json()) as { access: string; refresh?: string }
  setTokens(d.access, d.refresh)
  return d
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

async function authFetch(url: string, init?: RequestInit) {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const r = await fetch(url, { ...init, headers })
  if (r.status === 401) {
    clearAuth()
    throw new Error('Sesión expirada')
  }
  return r
}

type TicketDto = {
  id: number
  usuario: { nombre: string; identificacion: string; correo?: string; telefono?: string }
  equipo: { tipo: string; serie: string }
  descripcion: string
  tipo_dano: string
  estado: string
  fecha: string
  atendido_por?: string | null
  procedimiento?: string
}

export type Ticket = {
  id: number
  personName: string
  personId: string
  equipmentType: string
  damageType: string
  description: string
  status: string
  createdAt: string
  atendido_por?: string | null
  procedimiento?: string
}

function mapTicket(t: TicketDto): Ticket {
  return {
    id: t.id,
    personName: t.usuario?.nombre ?? '',
    personId: t.usuario?.identificacion ?? '',
    equipmentType: t.equipo?.tipo ?? '',
    damageType: t.tipo_dano ?? '',
    description: t.descripcion ?? '',
    status: t.estado,
    createdAt: t.fecha,
    atendido_por: t.atendido_por,
    procedimiento: t.procedimiento,
  }
}

export type CreateTicketPayload = {
  personName: string
  personId: string
  equipmentType: string
  damageType: string
  description: string
  email?: string
  phone?: string
}

export async function createTicket(data: CreateTicketPayload): Promise<{ ticketId: number }> {
  const r = await fetch(`${API_BASE}/solicitar-ticket/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const d = e?.detail
    const msg = typeof d === 'string' ? d : Array.isArray(d) ? (d[0] as string) : null
    if (msg) throw new Error(msg)
    const first = Object.values(e)[0]
    const arr = Array.isArray(first) ? (first[0] as string) : null
    throw new Error(arr || 'Error al crear el ticket')
  }
  return r.json() as Promise<{ ticketId: number }>
}

export async function getTickets(status?: 'pending' | 'completed'): Promise<{ tickets: Ticket[] }> {
  const url = status ? `${API_BASE}/tickets/?status=${status}` : `${API_BASE}/tickets/`
  const r = await authFetch(url)
  if (!r.ok) throw new Error('Error al cargar tickets')
  const list = (await r.json()) as TicketDto[]
  return { tickets: list.map(mapTicket) }
}

export async function getTicket(id: number): Promise<Ticket> {
  const r = await authFetch(`${API_BASE}/tickets/${id}/`)
  if (!r.ok) throw new Error('Error al cargar ticket')
  const t = (await r.json()) as TicketDto
  return mapTicket(t)
}

export async function completeTicket(
  ticketId: number,
  data: { technicianName: string; procedureDescription: string }
) {
  const token = getToken()
  if (!token) throw new Error('Sesión expirada')
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estado: 'CERRADO',
      atendido_por: data.technicianName,
      procedimiento: data.procedureDescription,
    }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'Error al completar el ticket')
  }
}

export async function downloadTicketPdf(ticketId: number) {
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/pdf/`)
  if (!r.ok) throw new Error('Error al descargar PDF')
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ticket_${ticketId}.pdf`
  a.click()
  URL.revokeObjectURL(a.href)
}

export type Statistics = {
  pending: number
  in_process: number
  closed: number
  total: number
  totalTickets: number
  completedTickets: number
  technicians: string[]
  technicianPerformance?: Record<string, number>
  failureTypes?: Record<string, number>
  equipmentFrequency?: { equipmentType: string; count: number }[]
}

export async function getStatistics(): Promise<Statistics> {
  const r = await authFetch(`${API_BASE}/stats/`)
  if (!r.ok) throw new Error('Error al cargar estadísticas')
  return r.json() as Promise<Statistics>
}
