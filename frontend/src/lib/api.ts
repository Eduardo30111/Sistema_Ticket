function normalizeHostTypo(url: string): string {
  return url.replace('://sistema_ticket-', '://sistema-ticket-')
}

/** Asegura sufijo /api sin doble barra. */
function ensureApiSuffix(base: string): string {
  const b = base.replace(/\/+$/, '')
  if (b.endsWith('/api')) return b
  return `${b}/api`
}

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (env) {
    return ensureApiSuffix(normalizeHostTypo(env))
  }
  if (import.meta.env.DEV) {
    return '/api'
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin.replace(/\/$/, '')}/api`
  }
  return 'http://127.0.0.1:8000/api'
}

// Mismo dominio en producción (Django sirve el SPA) o VITE_API_URL si lo defines.
export const API_BASE = resolveApiBase()

function getWsBaseUrl(): string {
  if (API_BASE.startsWith('/')) {
    if (typeof window === 'undefined') return 'ws://127.0.0.1:8000'
    const { protocol, host } = window.location
    return protocol === 'https:' ? `wss://${host}` : `ws://${host}`
  }
  return API_BASE.replace(/\/api\/?$/, '')
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://')
}

type JwtPayload = {
  user_id?: number
  sub?: number
  username?: string
  email?: string
  full_name?: string
  is_staff?: boolean
  modules?: {
    support?: boolean
    inventory?: boolean
  }
}

function getToken(): string | null {
  return localStorage.getItem('ticket_access')
}

export function getAccessToken(): string | null {
  return getToken()
}

export function getNotificationsSocketUrl(userId: number): string {
  const token = getToken()
  const baseUrl = `${getWsBaseUrl()}/ws/notifications/${userId}/`
  if (!token) return baseUrl
  return `${baseUrl}?token=${encodeURIComponent(token)}`
}

export function decodeToken(): JwtPayload | null {
  const token = getToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const segment = parts[1]
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(text) as JwtPayload
  } catch {
    return null
  }
}

export function getCurrentUser(): { id?: number; username?: string; fullName?: string; email?: string; is_staff?: boolean } | null {
  const storedUsername = localStorage.getItem('ticket_username')
  const payload = decodeToken()
  if (!payload && !storedUsername) return null
  const rawFull = typeof payload?.full_name === 'string' ? payload.full_name.trim() : ''
  const uname = (storedUsername ?? payload?.username ?? payload?.email ?? '').trim()
  return {
    id: payload?.user_id ?? payload?.sub ?? undefined,
    username: uname || undefined,
    fullName: rawFull || undefined,
    email: payload?.email ?? undefined,
    is_staff: payload?.is_staff === true,
  }
}

/** Nombre para mostrar del técnico en sesión (JWT first/last o usuario). */
export function getCurrentUserDisplayName(): string {
  const u = getCurrentUser()
  if (!u) return ''
  return (u.fullName && u.fullName.trim()) || (u.username && u.username.trim()) || ''
}

export function getModuleAccess(): { support: boolean; inventory: boolean } {
  const payload = decodeToken()
  const fallback = { support: true, inventory: true }
  if (!payload) return fallback
  const modules = payload.modules
  if (!modules) return fallback
  return {
    support: modules.support !== false,
    inventory: modules.inventory !== false,
  }
}

export function isAdmin(): boolean {
  const payload = decodeToken()
  return payload?.is_staff === true
}

function setTokens(access: string, _refresh?: string, username?: string) {
  localStorage.setItem('ticket_access', access)
  if (username) localStorage.setItem('ticket_username', username)
}

function normalizeDamageType(value?: string | null): string {
  if (!value) return ''
  return value
    .replace(/danio/gi, 'daño')
    .replace(/dano/gi, 'daño')
    .replace(/fisico/gi, 'físico')
}

export function clearAuth() {
  localStorage.removeItem('ticket_access')
  localStorage.removeItem('ticket_username')
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
  const d = (await r.json()) as { access: string; refresh?: string; username?: string; full_name?: string; modules?: { support?: boolean; inventory?: boolean } }
  setTokens(d.access, d.refresh, d.username)
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
  equipo: { tipo: string; serie: string; modelo?: string | null; marca?: string | null }
  usuario_nombre?: string
  usuario_identificacion?: string
  equipo_tipo?: string
  equipo_serie?: string
  equipo_modelo?: string | null
  asignacion_activa_usuario_id?: number | null
  asignacion_activa_usuario_nombre?: string | null
  descripcion: string
  tipo_dano: string
  estado: string
  fecha: string
  atendido_por?: string | null
  procedimiento?: string
  tiempo_estipulado_dias?: number
  fecha_limite?: string
  dias_restantes?: number | null
  alerta_tiempo?: boolean
  alerta_nivel?: 'VENCIDO' | 'PROXIMO_A_VENCER' | null
  alerta_mensaje?: string
  formato_servicio?: Record<string, unknown>
  numero_ficha_tecnica?: number | null
  demorado_publico?: boolean
}

export type FormatoServicio = {
  /** ISO: fecha/hora en que se cerró el ticket (backend). Sirve para listar completados por día real. */
  fecha_cierre?: string
  dependencia: string
  orden_servicio_no: string
  identificacion_funcionario: string
  datos_equipo: string
  placa_inventario: string
  modelo: string
  serial: string
  ip_equipo: string
  grupo_trabajo: string
  mac_equipo: string
  impresora: string
  dhcp: string
  ip_fija: string
  mac_impresora: string
  fecha: string
  diagnostico_realizo: string
  diagnostico_descripcion: string
  soporte_realizo: string
  /** Opcional; si no hay valor en datos viejos, el PDF usa «Técnico». */
  cargo_tecnico?: string
  soporte_descripcion: string
  recomendaciones: string
  firma_tecnico: string
  nombre_tecnico: string
  firma_funcionario: string
  nombre_funcionario: string
  insumos?: Array<{ stock_id: number; cantidad: number; nombre: string }>
}

export type Ticket = {
  id: number
  personName: string
  personId: string
  equipmentType: string
  /** Serie del equipo capturada al crear el ticket (equipo.serie). */
  equipmentSerial: string
  /** Modelo del equipo si existe en la ficha de inventario. */
  equipmentModel: string
  damageType: string
  description: string
  status: string
  createdAt: string
  atendido_por?: string | null
  procedimiento?: string
  dueInDays: number | null
  dueDate: string | null
  slaDays: number
  timeAlert: boolean
  timeAlertLevel: 'VENCIDO' | 'PROXIMO_A_VENCER' | null
  timeAlertMessage: string
  formatoServicio: Partial<FormatoServicio>
  /** Consecutivo del PDF oficial (solo tickets cerrados). */
  numeroFichaTecnica?: number | null
  assignedTechnicianId: number | null
  assignedTechnicianName: string | null
  demoradoPublico: boolean
}

function mapTicket(t: TicketDto): Ticket {
  const eq = t.equipo
  const equipmentSerial = (eq?.serie ?? t.equipo_serie ?? '').trim()
  const equipmentModel = (eq?.modelo ?? t.equipo_modelo ?? '').trim()
  return {
    id: t.id,
    personName: t.usuario?.nombre ?? t.usuario_nombre ?? '',
    personId: t.usuario?.identificacion ?? t.usuario_identificacion ?? '',
    equipmentType: t.equipo?.tipo ?? t.equipo_tipo ?? '',
    equipmentSerial,
    equipmentModel,
    damageType: normalizeDamageType(t.tipo_dano),
    description: t.descripcion ?? '',
    status: t.estado,
    createdAt: t.fecha,
    atendido_por: t.atendido_por,
    procedimiento: t.procedimiento,
    dueInDays: t.dias_restantes ?? null,
    dueDate: t.fecha_limite ?? null,
    slaDays: t.tiempo_estipulado_dias ?? 10,
    timeAlert: t.alerta_tiempo ?? false,
    timeAlertLevel: t.alerta_nivel ?? null,
    timeAlertMessage: t.alerta_mensaje ?? '',
    formatoServicio: (t.formato_servicio ?? {}) as Partial<FormatoServicio>,
    numeroFichaTecnica: t.numero_ficha_tecnica ?? null,
    assignedTechnicianId: t.asignacion_activa_usuario_id ?? null,
    assignedTechnicianName: t.asignacion_activa_usuario_nombre ?? null,
    demoradoPublico: Boolean(t.demorado_publico),
  }
}

export type CreateTicketPayload = {
  personName: string
  personId: string
  equipmentType: string
  equipmentSerial?: string
  damageType: string
  description: string
  officeCode?: string
  dependencia?: string
  email?: string
  phone?: string
}

export async function createTicket(data: CreateTicketPayload): Promise<{ ticketId: number }> {
  const payload: CreateTicketPayload = {
    ...data,
    officeCode: data.officeCode || data.dependencia,
  }

  const r = await fetch(`${API_BASE}/solicitar-ticket/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

export type PublicTicketReview = {
  ticketId: number
  estado: string
  fecha_creacion: string
  atendido_por: string
  descripcion: string
  procedimiento: string
  asignado: boolean
  demorado_publico: boolean
}

export async function reviewPublicTicket(personId: string, ticketId?: number): Promise<PublicTicketReview> {
  const r = await fetch(`${API_BASE}/revisar-ticket/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketId != null && ticketId > 0 ? { personId, ticketId } : { personId }),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(e.error || 'No se pudo revisar el ticket')
  }
  return r.json() as Promise<PublicTicketReview>
}

export async function requestPublicTicketDelay(personId: string, ticketId: number): Promise<PublicTicketReview> {
  const r = await fetch(`${API_BASE}/ticket-demora-publico/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId, ticketId }),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(e.error || 'No se pudo registrar la solicitud de demora')
  }
  return r.json() as Promise<PublicTicketReview & { ok?: boolean; already?: boolean }>
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

export async function setTicketInProgress(ticketId: number): Promise<void> {
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: 'EN_PROCESO' }),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const estado = e.estado
    const fromEstado =
      typeof estado === 'string'
        ? estado
        : Array.isArray(estado) && estado.length
          ? String(estado[0])
          : ''
    const detail = typeof e.detail === 'string' ? e.detail : ''
    throw new Error(fromEstado || detail || 'No se pudo pasar el ticket a en proceso')
  }
}

export async function completeTicket(
  ticketId: number,
  data: {
    procedureDescription: string
    formatoServicio?: Partial<FormatoServicio>
    inventoryItems?: Array<{ stock_id: number; cantidad: number; nombre: string }>
  }
) {
  const token = getToken()
  if (!token) throw new Error('Sesión expirada')
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estado: 'CERRADO',
      procedimiento: data.procedureDescription,
      formato_servicio: {
        ...(data.formatoServicio || {}),
        insumos: data.inventoryItems || [],
      },
    }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'Error al completar el ticket')
  }
}

export async function downloadTicketPdf(ticketId: number) {
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/pdf/?inline=0`)
  if (!r.ok) throw new Error('Error al descargar PDF')
  const cd = r.headers.get('Content-Disposition') || ''
  let filename = `ticket_${ticketId}.pdf`
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd)
  if (m?.[1]) {
    try {
      filename = decodeURIComponent(m[1].replace(/"/g, '').trim())
    } catch {
      filename = m[1].replace(/"/g, '').trim()
    }
  }
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function viewTicketPdf(ticketId: number) {
  const r = await authFetch(`${API_BASE}/tickets/${ticketId}/pdf/?inline=1`)
  if (!r.ok) throw new Error('Error al abrir PDF')
  const mime = r.headers.get('Content-Type')?.split(';')[0]?.trim() || 'application/pdf'
  const blob = await r.blob()
  const typed =
    blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: mime })
  const url = URL.createObjectURL(typed)
  window.open(url, '_blank', 'noopener,noreferrer')
  // Revocar muy pronto deja la pestaña en blanco si el visor PDF tarda en cargar.
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
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
  topWorker?: { name: string; totalRepairs: number } | null
  myRepairsToday?: number
  totalRepairsToday?: number
  repairsPerDay?: {
    date: string
    totalRepairs: number
    byTechnician: Record<string, number>
  }[]
  weeklyEfficiency?: {
    rank: number
    technician: string
    completedRepairs: number
    averageResolutionHours: number
    efficiencyScore: number
  }[]
  monthlyEfficiency?: {
    rank: number
    technician: string
    completedRepairs: number
    averageResolutionHours: number
    efficiencyScore: number
  }[]
  dailyOverview?: {
    today: {
      date: string
      tickets: { created: number; closed: number }
      assignments: { created: number; completed: number }
      users: number
      equipment: number
      repairs: number
    }
    history: {
      date: string
      tickets: { created: number; closed: number }
      assignments: { created: number; completed: number }
      users: number
      equipment: number
      repairs: number
    }[]
  }
  generatedAt?: string
}

export type PublicOffice = {
  id: number
  nombre: string
  codigo: string
  descripcion: string
  activa: boolean
  qr_payload: string
  qr_image_url: string
}

export type CatalogPerson = {
  id: number
  tipo: 'FUNCIONARIO' | 'CONTRATISTA'
  nombre: string
  identificacion: string
  correo: string
  telefono: string
}

export type OfficeEquipment = {
  id: number
  tipo: string
  serie: string
  modelo: string
  marca: string
  tipo_persona: 'FUNCIONARIO' | 'CONTRATISTA' | 'SIN_ASIGNAR'
  persona_id: number | null
}

export type OfficeCatalog = {
  office: PublicOffice
  people: {
    funcionarios: CatalogPerson[]
    contratistas: CatalogPerson[]
  }
  equipment: OfficeEquipment[]
}

export type InventoryStockForDelivery = {
  id: number
  categoria?: string
  producto: string
  marca?: string
  tipo: string
  referencia_fabricante: string
  codigo_barras?: string
  numero_serie?: string
  cantidad_actual: number
  activo: boolean
}

export type InventoryDeliveryOffice = {
  id: number
  nombre: string
}

export type InventoryDeliveryPerson = {
  id: number
  nombre: string
  identificacion: string
  tipo: 'FUNCIONARIO' | 'CONTRATISTA'
  tipo_display: string
  oficina_id: number
  oficina_nombre: string
}

export type InventoryDeliveryCatalog = {
  oficinas: InventoryDeliveryOffice[]
  personas: InventoryDeliveryPerson[]
}

export type CreateInventorySalidaPayload = {
  stock: number
  cantidad: number
  motivo: 'INSTALACION' | 'TRASLADO' | 'PRESTAMO' | 'BAJA' | 'EXTRAVIADO'
  oficina_destino: number
  funcionario_destino: number
  observaciones?: string
}

function normalizeArrayResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[]
  }
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown[] }).results)) {
    return ((data as { results: unknown[] }).results) as T[]
  }
  return []
}

export async function getInventoryStockForDelivery(): Promise<InventoryStockForDelivery[]> {
  const r = await authFetch(`${API_BASE}/inventario/stock/`)
  if (!r.ok) throw new Error('No se pudo cargar el stock de inventario')
  const raw = normalizeArrayResponse<InventoryStockForDelivery>(await r.json())
  return raw.filter((item) => item.activo && item.cantidad_actual > 0)
}

export async function getInventoryDeliveryCatalog(oficinaId?: number): Promise<InventoryDeliveryCatalog> {
  const params = new URLSearchParams()
  if (oficinaId) {
    params.set('oficina_id', String(oficinaId))
  }
  const url = `${API_BASE}/inventario/salidas/catalogo_entrega/${params.toString() ? `?${params.toString()}` : ''}`
  const r = await authFetch(url)
  if (!r.ok) throw new Error('No se pudo cargar el catálogo de entrega')
  return r.json() as Promise<InventoryDeliveryCatalog>
}

export async function createInventorySalida(payload: CreateInventorySalidaPayload): Promise<{ id: number; acta_pdf_url?: string }> {
  const r = await authFetch(`${API_BASE}/inventario/salidas/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const first = Object.values(e)[0]
    const msg = Array.isArray(first)
      ? String(first[0] ?? '')
      : (typeof first === 'string' ? first : '')
    throw new Error(msg || 'No se pudo registrar la salida de inventario')
  }
  return r.json() as Promise<{ id: number; acta_pdf_url?: string }>
}

export async function getPublicOffices(): Promise<PublicOffice[]> {
  const r = await fetch(`${API_BASE}/oficinas-publicas/`)
  if (!r.ok) throw new Error('No se pudieron cargar las oficinas')
  return r.json() as Promise<PublicOffice[]>
}

export async function getOfficeCatalog(officeCodeOrQr: string, personId?: string): Promise<OfficeCatalog> {
  const params = new URLSearchParams({ qr: officeCodeOrQr })
  if (personId?.trim()) {
    params.set('personId', personId.trim())
  }
  const r = await fetch(`${API_BASE}/oficina-catalogo/?${params.toString()}`)
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const first = Object.values(e)[0]
    const msg = Array.isArray(first) ? (first[0] as string) : (typeof first === 'string' ? first : null)
    throw new Error(msg || 'No se pudo cargar el catálogo de oficina')
  }
  return r.json() as Promise<OfficeCatalog>
}

export async function requestContractorReactivation(identificacion: string, motivo: string): Promise<{ ok: boolean; message: string; requestId: number }> {
  const r = await fetch(`${API_BASE}/solicitar-reactivacion-contratista/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion, motivo }),
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const first = Object.values(e)[0]
    const arr = Array.isArray(first) ? (first[0] as string) : null
    throw new Error(arr || 'No se pudo registrar la solicitud de reactivación')
  }
  return r.json() as Promise<{ ok: boolean; message: string; requestId: number }>
}

export type ChatMessage = {
  id: number
  sender: number
  sender_name: string
  sender_username: string
  recipient: number
  recipient_name: string
  recipient_username: string
  message: string
  created_at: string
}

export type ChatUser = {
  id: number
  username: string
  full_name: string
  email: string
  is_staff: boolean
}

export async function getStatistics(): Promise<Statistics> {
  const r = await authFetch(`${API_BASE}/stats/`)
  if (!r.ok) throw new Error('Error al cargar estadísticas')
  return r.json() as Promise<Statistics>
}

export async function getChatUsers(): Promise<ChatUser[]> {
  const r = await authFetch(`${API_BASE}/chat-users/`)
  if (!r.ok) throw new Error('Error al cargar usuarios del chat')
  return r.json() as Promise<ChatUser[]>
}

export async function getInternalMessages(peerUserId: number): Promise<ChatMessage[]> {
  const r = await authFetch(`${API_BASE}/internal-messages/?peer_user_id=${peerUserId}`)
  if (!r.ok) throw new Error('Error al cargar mensajes del chat')
  return r.json() as Promise<ChatMessage[]>
}

/** Mensajes donde el usuario actual es el destinatario (bandeja / notificaciones). */
export async function getInternalMessageInbox(): Promise<ChatMessage[]> {
  const r = await authFetch(`${API_BASE}/internal-messages/inbox/`)
  if (!r.ok) throw new Error('Error al cargar la bandeja de chat')
  return r.json() as Promise<ChatMessage[]>
}

export async function sendInternalMessage(recipientUserId: number, message: string): Promise<ChatMessage> {
  const r = await authFetch(`${API_BASE}/internal-messages/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: recipientUserId, message }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'No se pudo enviar el mensaje')
  }
  return r.json() as Promise<ChatMessage>
}

export type MascotaFeedbackPayload = {
  nombre: string
  oficina: string
  mejora: string
}

export async function sendMascotaFeedback(data: MascotaFeedbackPayload): Promise<void> {
  const r = await fetch(`${API_BASE}/mascota-feedback/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as { detail?: string }).detail || 'No se pudo enviar la sugerencia')
  }
}
