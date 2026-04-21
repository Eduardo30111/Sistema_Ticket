import { useState, useEffect } from 'react'
import type { Ticket, FormatoServicio, Statistics } from '@/lib/api'
import { getTickets, completeTicket, downloadTicketPdf, viewTicketPdf, getStatistics, clearAuth, isAdmin, getCurrentUser } from '@/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { MisTareas } from './MisTareas'
import { InternalChatPanel } from './InternalChatPanel'
import { NotificationBar } from './NotificationBar'
import { DailyRepairsCounter } from './DailyRepairsCounter'
import { toast } from 'sonner'
import { Loader2, Download, CheckCircle, LogOut, AlertTriangle, Timer, Cpu, Activity, ShieldCheck, MessageSquare, X } from 'lucide-react'
import robotMascot from '@/assets/RobotTIC.png'

interface TechnicianDashboardProps {
  onLogout: () => void
}

export function TechnicianDashboard({ onLogout }: TechnicianDashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Statistics | null>(null)
  const [completingTicket, setCompletingTicket] = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [procedureDescription, setProcedureDescription] = useState('')
  const [serviceForm, setServiceForm] = useState<Partial<FormatoServicio>>({})
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [showChatModal, setShowChatModal] = useState(false)
  const currentUser = getCurrentUser()
  type DailyHistoryItem = NonNullable<Statistics['dailyOverview']>['history'][number]
  type RepairDayItem = NonNullable<Statistics['repairsPerDay']>[number]
  type EfficiencyItem = NonNullable<Statistics['weeklyEfficiency']>[number]

  useEffect(() => {
    loadData()

    const interval = window.setInterval(() => {
      loadData(false)
    }, 20000)

    return () => window.clearInterval(interval)
  }, [])

  const loadData = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true)
    }

    try {
      const { tickets: data } = await getTickets()
      setTickets(data)
      const statsData = await getStatistics()
      setStats(statsData)
    } catch (error) {
      if (showLoader) {
        toast.error('Error al cargar datos')
      }
      console.error(error)
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }

  const handleCompleteTicket = async (ticket: Ticket) => {
    if (!procedureDescription.trim()) {
      toast.error('Por favor describe el procedimiento realizado')
      return
    }

    if (!serviceForm.dependencia?.trim()) {
      toast.error('La dependencia es obligatoria en el formato')
      return
    }

    if (!serviceForm.serial?.trim()) {
      toast.error('El numero de usuario / serial es obligatorio en el formato')
      return
    }

    setCompletingTicket(ticket.id)
    try {
      await completeTicket(ticket.id, {
        procedureDescription,
        formatoServicio: {
          ...serviceForm,
          orden_servicio_no: serviceForm.orden_servicio_no || `${ticket.id}`,
          nombre_funcionario: ticket.personName,
          datos_equipo: ticket.equipmentType,
          soporte_descripcion: procedureDescription,
        },
      })
      toast.success('Ticket completado exitosamente')
      setProcedureDescription('')
      setServiceForm({})
      setSelectedTicket(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al completar el ticket')
    } finally {
      setCompletingTicket(null)
    }
  }

  const handleDownloadPdf = async (ticketId: number) => {
    try {
      await downloadTicketPdf(ticketId)
      toast.success('PDF descargado correctamente')
    } catch {
      toast.error('Error al descargar PDF')
    }
  }

  const handleViewPdf = async (ticketId: number) => {
    try {
      await viewTicketPdf(ticketId)
    } catch {
      toast.error('Error al abrir PDF')
    }
  }

  const openResolverForm = (ticket: Ticket) => {
    const currentUserId = currentUser?.id ? Number(currentUser.id) : null
    const assignedToOther = Boolean(
      ticket.assignedTechnicianId &&
      !isAdmin() &&
      ticket.assignedTechnicianId !== currentUserId
    )

    if (assignedToOther) {
      toast.error(`Este ticket ya está asignado a ${ticket.assignedTechnicianName || 'otro técnico'}.`)
      return
    }

    const now = new Date().toISOString().slice(0, 10)
    setServiceForm({
      dependencia: ticket.formatoServicio?.dependencia || '',
      orden_servicio_no: ticket.formatoServicio?.orden_servicio_no || `${ticket.id}`,
      datos_equipo: ticket.equipmentType,
      modelo: ticket.formatoServicio?.modelo || '',
      serial: ticket.formatoServicio?.serial || '',
      fecha: ticket.formatoServicio?.fecha || now,
      soporte_realizo: ticket.formatoServicio?.soporte_realizo || ticket.formatoServicio?.diagnostico_realizo || currentUser?.fullName || currentUser?.username || '',
      soporte_descripcion: ticket.formatoServicio?.soporte_descripcion || procedureDescription,
      recomendaciones: ticket.formatoServicio?.recomendaciones || '',
      nombre_funcionario: ticket.personName,
    })
    setProcedureDescription(ticket.procedimiento || '')
    setSelectedTicket(ticket)
  }

  const handleLogout = () => {
    clearAuth()
    onLogout()
  }

  const handleNotificationClick = (tareaId: number) => {
    setSelectedTaskId(tareaId)
    setActiveTab('mis-tareas')
  }

  const handleResolveAssignedTicket = (ticketId: number) => {
    const ticket = tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      toast.error('No se encontro el ticket asignado en la lista de pendientes.')
      return
    }
    setActiveTab('pending')
    openResolverForm(ticket)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-(--primary)" />
      </div>
    )
  }

  const normalizeName = (value?: string | null) => (value || '').trim().toLowerCase()

  const technicianNames = [currentUser?.fullName, currentUser?.username]
    .map(name => normalizeName(name))
    .filter(Boolean)

  const pendingTickets = tickets.filter(t => !['CERRADO', 'COMPLETADO'].includes(t.status))
  const completedTickets = tickets.filter(t => ['CERRADO', 'COMPLETADO'].includes(t.status))
  const pendingAlerts = pendingTickets.filter((ticket) => ticket.timeAlert)
  const overdueTickets = pendingAlerts.filter((ticket) => ticket.timeAlertLevel === 'VENCIDO')
  const nearDueTickets = pendingAlerts.filter((ticket) => ticket.timeAlertLevel === 'PROXIMO_A_VENCER')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStats = stats?.repairsPerDay?.find(
    (item: RepairDayItem) => new Date(item.date).toDateString() === today.toDateString()
  )
  const totalRepairsToday = stats?.totalRepairsToday ?? todayStats?.totalRepairs ?? 0

  const myRepairsTodayFromStats = Object.entries(todayStats?.byTechnician || {}).reduce((total, [name, count]) => {
    return technicianNames.includes(normalizeName(name)) ? total + Number(count) : total
  }, 0)

  const myRepairsTodayFromTickets = tickets.filter((ticket) => {
    if (ticket.status !== 'CERRADO') return false
    const ticketDate = new Date(ticket.createdAt)
    ticketDate.setHours(0, 0, 0, 0)
    if (ticketDate.getTime() !== today.getTime()) return false
    return technicianNames.includes(normalizeName(ticket.atendido_por))
  }).length

  const myRepairsToday = stats?.myRepairsToday ?? (myRepairsTodayFromStats || myRepairsTodayFromTickets)

  const visibleCompletedTickets = completedTickets

  const toLocalDateKey = (value: string | Date) => {
    const d = new Date(value)
    const year = d.getFullYear()
    const month = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDayLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00`)
    return d.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const todayDateKey = toLocalDateKey(new Date())
  const completedByDay = visibleCompletedTickets.reduce((acc, ticket) => {
    const key = toLocalDateKey(ticket.createdAt)
    if (!acc[key]) acc[key] = []
    acc[key].push(ticket)
    return acc
  }, {} as Record<string, Ticket[]>)

  const todayCompletedTickets = completedByDay[todayDateKey] || []
  const historicalCompletedEntries = Object.entries(completedByDay)
    .filter(([day]) => day !== todayDateKey)
    .sort(([a], [b]) => b.localeCompare(a))

  const renderCompletedTicketCard = (ticket: Ticket) => (
    <div key={ticket.id} className="digital-card digital-card-interactive rounded-lg border-2 border-[#81c784] p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#1a4d2e]">
            Ticket #{ticket.id}
          </h3>
          <p className="text-sm text-[#2d7a4f]">
            {ticket.personName} ({ticket.personId})
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleViewPdf(ticket.id)}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-1 text-sm text-white transition hover:bg-indigo-600"
          >
            Ver PDF
          </button>
          <button
            onClick={() => handleDownloadPdf(ticket.id)}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600"
          >
            <Download className="size-4" />
            Descargar
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-xs text-gray-500">Equipo</p>
          <p className="font-medium text-[#1a4d2e]">{ticket.equipmentType}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Tipo de Daño</p>
          <p className="font-medium text-[#1a4d2e]">{ticket.damageType}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Atendido por</p>
          <p className="font-medium text-[#1a4d2e]">{ticket.atendido_por || 'Sin registrar'}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-600">{ticket.description}</p>
      {ticket.procedimiento && (
        <div className="mt-3 rounded-lg bg-[#f1f8e9] p-3">
          <p className="text-xs text-gray-500">Procedimiento</p>
          <p className="text-sm text-[#1a4d2e]">{ticket.procedimiento}</p>
        </div>
      )}

      {ticket.formatoServicio && Object.keys(ticket.formatoServicio).length > 0 && (
        <div className="mt-3 rounded-lg border border-[#c8e6c9] bg-[#f7fff8] p-3">
          <p className="text-xs text-gray-500">Formato de orden completado</p>
          <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
            <p><span className="font-semibold">Dependencia:</span> {ticket.formatoServicio.dependencia || '-'}</p>
            <p><span className="font-semibold">Numero del ticket:</span> {ticket.formatoServicio.orden_servicio_no || `${ticket.id}`}</p>
            <p><span className="font-semibold">Equipo:</span> {ticket.formatoServicio.datos_equipo || ticket.equipmentType}</p>
            <p><span className="font-semibold">Numero de usuario / Serial:</span> {ticket.formatoServicio.serial || '-'}</p>
            <p><span className="font-semibold">Soporte realizado por:</span> {ticket.formatoServicio.soporte_realizo || ticket.formatoServicio.diagnostico_realizo || ticket.atendido_por || '-'}</p>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_8%,#eaffff_0%,#f5fff6_35%,#f8ffeb_63%,#ffffff_100%)]">
      <NotificationBar
        onNotificationClick={handleNotificationClick}
        onChatNotificationClick={() => setShowChatModal(true)}
      />
      <div className="mx-auto max-w-6xl p-4">
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-[#89d7d9] bg-[linear-gradient(135deg,#f1feff_0%,#f7fff5_44%,#fffde9_100%)] p-5 shadow-[0_22px_56px_rgba(14,84,86,0.18)] md:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(13,108,112,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(13,108,112,0.08)_1px,transparent_1px)] bg-size-[24px_24px] opacity-40" />
          <div className="pointer-events-none absolute inset-0 animate-[digital-scan_6s_linear_infinite] bg-[linear-gradient(180deg,transparent_0%,rgba(26,183,191,0.08)_46%,transparent_100%)]" />
          <div className="pointer-events-none absolute -left-16 top-8 h-56 w-56 rounded-full bg-[#57dbe0]/28 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-6 h-56 w-56 rounded-full bg-[#d2ff62]/28 blur-3xl" />

          <div className="relative grid items-center gap-5 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#8fd6d8] bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#0f6d72]">
                    <Cpu className="size-3" />
                    NODO TECNICO TIC
                  </p>
                  <h1 className="text-3xl font-black tracking-tight text-[#124b4f] md:text-[2.2rem]">
                    {isAdmin() ? 'Panel Administrador' : 'Área de Técnicos'}
                  </h1>
                  <p className="max-w-2xl text-[#2b7478]">
                    {isAdmin() ? 'Gestión completa de tickets y estadísticas' : 'Gestiona y resuelve tickets de soporte'}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-lg border border-[#f6a39d] bg-[#ff5f54] px-4 py-2 font-semibold text-white shadow-[0_8px_18px_rgba(185,34,23,0.24)] transition hover:bg-[#e44a40]"
                >
                  <LogOut className="size-4" />
                  Cerrar Sesión
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-[#9ed9dc] bg-white/85 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(110,212,218,0.25)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0f6d72]">Pendientes</p>
                  <p className="font-mono text-xl font-black text-[#124b4f]">{pendingTickets.length.toString().padStart(2, '0')}</p>
                </div>
                <div className="rounded-xl border border-[#b4dca1] bg-white/85 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(191,237,99,0.3)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#3b6f2e]">Completados</p>
                  <p className="font-mono text-xl font-black text-[#295e2a]">{completedTickets.length.toString().padStart(2, '0')}</p>
                </div>
                <div className="rounded-xl border border-[#f1ce83] bg-[#fffef1] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(247,208,116,0.35)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6618]">Alertas</p>
                  <p className="font-mono text-xl font-black text-[#6f5317]">{pendingAlerts.length.toString().padStart(2, '0')}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#9fdcdf] bg-[#ebffff] px-3 py-1 text-[#0f6d72]">
                  <Activity className="size-3" /> Trabajando...
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#d5e995] bg-[#f9ffea] px-3 py-1 text-[#4f6f1b]">
                  <ShieldCheck className="size-3" /> Estado estable
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-44.5 md:w-53.75">
              <div className="absolute inset-0 rounded-4xl animate-[hud-pulse_2.2s_ease-in-out_infinite] bg-[#57dbe0]/30 blur-2xl" />
              <button
                type="button"
                onClick={() => setShowChatModal(true)}
                className="relative w-full rounded-4xl border border-[#88d0d4] bg-[linear-gradient(160deg,#ffffff_0%,#eefeff_55%,#f6ffeb_100%)] p-3 shadow-[0_18px_34px_rgba(15,82,86,0.22)] transition hover:scale-[1.02]"
              >
                <img
                  src={robotMascot}
                  alt="Robot TIC"
                  className="robot-clean mx-auto h-36 w-36 animate-[robot-float_2.6s_ease-in-out_infinite] object-contain md:h-40 md:w-40"
                />
                <p className="mt-1 text-center text-[11px] font-black uppercase tracking-[0.2em] text-[#0f6d72]">Asistente TIC</p>
                <p className="text-center font-mono text-[10px] font-bold text-[#2a7c81]">ROBOT_TIC_01</p>
                <p className="mt-1 inline-flex items-center justify-center gap-1 rounded-full border border-[#95d5da] bg-[#eaffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#116a70]">
                  <MessageSquare className="size-3" /> Abrir chat
                </p>
              </button>
            </div>
          </div>
        </div>

        {showChatModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] md:p-5"
            onClick={() => setShowChatModal(false)}
          >
            <div
              className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[#99dde1] bg-[linear-gradient(135deg,#f5ffff_0%,#f7fff5_100%)] p-2 shadow-[0_24px_70px_rgba(14,84,86,0.3)] md:p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between md:mb-3">
                <h2 className="text-lg font-black text-[#124b4f]">Chat Interno</h2>
                <button
                  type="button"
                  onClick={() => setShowChatModal(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#f0a6a1] bg-[#ff6258] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-[#e84f45]"
                >
                  <X className="size-3" /> Cerrar
                </button>
              </div>
              <InternalChatPanel />
            </div>
          </div>
        )}

        {!isAdmin() && <DailyRepairsCounter myRepairsToday={myRepairsToday} totalRepairsToday={totalRepairsToday} />}

        {pendingAlerts.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="digital-card rounded-lg border-2 border-[#ffb74d] bg-[#fff3e0] p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-[#e65100]" />
                <h2 className="text-sm font-bold text-[#bf360c]">
                  Alerta de tiempo: {pendingAlerts.length} ticket(s) con 10 días retardado
                </h2>
              </div>
              <p className="mt-1 text-sm text-[#e65100]">
                Vencidos: {overdueTickets.length} | Próximos a vencer: {nearDueTickets.length}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {pendingAlerts.slice(0, 4).map((ticket) => (
                <div
                  key={`alert-${ticket.id}`}
                  className={`digital-card-soft rounded-lg border-2 p-3 ${ticket.timeAlertLevel === 'VENCIDO' ? 'border-[#e57373] bg-[#ffebee]' : 'border-[#ffcc80] bg-[#fff8e1]'}`}
                >
                  <p className="text-sm font-semibold text-[#1a4d2e]">
                    Ticket #{ticket.id} - {ticket.personName}
                  </p>
                  <p className="text-xs text-gray-700">{ticket.timeAlertMessage || 'Ticket cercano al vencimiento.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats && isAdmin() && (
          <div className="mb-8 space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="digital-card digital-card-interactive rounded-lg border-2 border-[#ffd54f] bg-[#fffde7] p-4">
                <p className="text-sm text-[#1a4d2e]">Pendientes</p>
                <p className="text-2xl font-bold text-[#fbc02d]">{stats.pending || 0}</p>
              </div>
              <div className="digital-card digital-card-interactive rounded-lg border-2 border-[#ff9800] bg-[#fff3e0] p-4">
                <p className="text-sm text-[#1a4d2e]">En Proceso</p>
                <p className="text-2xl font-bold text-[#ff9800]">{stats.in_process || 0}</p>
              </div>
              <div className="digital-card digital-card-interactive rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-4">
                <p className="text-sm text-[#1a4d2e]">Cerrados</p>
                <p className="text-2xl font-bold text-[#2d7a4f]">{stats.closed || 0}</p>
              </div>
              <div className="digital-card digital-card-interactive rounded-lg border-2 border-[#64b5f6] bg-[#e3f2fd] p-4">
                <p className="text-sm text-[#1a4d2e]">Total</p>
                <p className="text-2xl font-bold text-[#1976d2]">{stats.total || 0}</p>
              </div>
              <div className="digital-card digital-card-interactive rounded-lg border-2 border-[#ba68c8] bg-[#f3e5f5] p-4">
                <p className="text-sm text-[#1a4d2e]">Top Técnico</p>
                <p className="text-sm font-semibold text-[#6a1b9a]">{stats.topWorker?.name || 'Sin datos'}</p>
                <p className="text-lg font-bold text-[#8e24aa]">{stats.topWorker?.totalRepairs || 0} reparaciones</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="digital-card-soft rounded-lg border border-[#c8e6c9] bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#1a4d2e]">Resumen diario (hoy)</h3>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p><span className="font-semibold">Tickets creados:</span> {stats.dailyOverview?.today?.tickets?.created || 0}</p>
                  <p><span className="font-semibold">Tickets cerrados:</span> {stats.dailyOverview?.today?.tickets?.closed || 0}</p>
                  <p><span className="font-semibold">Asignaciones creadas:</span> {stats.dailyOverview?.today?.assignments?.created || 0}</p>
                  <p><span className="font-semibold">Asignaciones finalizadas:</span> {stats.dailyOverview?.today?.assignments?.completed || 0}</p>
                  <p><span className="font-semibold">Usuarios registrados:</span> {stats.dailyOverview?.today?.users || 0}</p>
                  <p><span className="font-semibold">Equipos registrados:</span> {stats.dailyOverview?.today?.equipment || 0}</p>
                </div>
                {(stats.dailyOverview?.history || []).length > 0 && (
                  <details className="mt-3 rounded-md border border-[#dcedc8] bg-[#f7fff8] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[#2d7a4f]">Ver histórico por día</summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {(stats.dailyOverview?.history || []).slice(0, 15).map((day: DailyHistoryItem) => (
                        <div key={`hist-${day.date}`} className="digital-card-soft rounded-md bg-white px-3 py-2">
                          <p className="font-semibold text-[#1a4d2e]">{day.date}</p>
                          <p className="text-[#2d7a4f]">Tickets Creados/Cerrados: {day.tickets?.created || 0}/{day.tickets?.closed || 0}</p>
                          <p className="text-[#2d7a4f]">Asignaciones Creadas/Finalizadas: {day.assignments?.created || 0}/{day.assignments?.completed || 0}</p>
                          <p className="text-[#2d7a4f]">Usuarios: {day.users || 0} | Equipos: {day.equipment || 0}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div className="digital-card-soft rounded-lg border border-[#c8e6c9] bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#1a4d2e]">Reparaciones por día (últimos 30 días)</h3>
                <div className="space-y-2 text-sm">
                  {(stats.repairsPerDay || []).slice(-7).reverse().map((item: RepairDayItem) => (
                    <div key={item.date} className="digital-card-soft flex items-center justify-between rounded-md bg-[#f7fff8] px-3 py-2">
                      <span className="text-[#2d7a4f]">{item.date}</span>
                      <span className="font-semibold text-[#1a4d2e]">{item.totalRepairs} reparaciones</span>
                    </div>
                  ))}
                  {(stats.repairsPerDay || []).length === 0 && (
                    <p className="text-gray-500">No hay reparaciones finalizadas registradas.</p>
                  )}
                </div>
              </div>

              <div className="digital-card-soft rounded-lg border border-[#c8e6c9] bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#1a4d2e]">Actualización en tiempo real</h3>
                <p className="text-sm text-[#2d7a4f]">Datos del panel actualizados automáticamente cada 20 segundos.</p>
                <p className="mt-2 text-xs text-gray-500">
                  Última actualización: {stats.generatedAt ? new Date(stats.generatedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="digital-card-soft rounded-lg border border-[#bbdefb] bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-[#0d47a1]">Eficiencia semanal</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[#1565c0]">
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Técnico</th>
                        <th className="px-2 py-2">Reparaciones</th>
                        <th className="px-2 py-2">Prom. Horas</th>
                        <th className="px-2 py-2">Puntaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.weeklyEfficiency || []).map((row: EfficiencyItem) => (
                        <tr key={`week-${row.rank}-${row.technician}`} className="border-b last:border-b-0">
                          <td className="px-2 py-2 font-semibold text-[#0d47a1]">{row.rank}</td>
                          <td className="px-2 py-2 text-[#1a4d2e]">{row.technician}</td>
                          <td className="px-2 py-2">{row.completedRepairs}</td>
                          <td className="px-2 py-2">{row.averageResolutionHours}</td>
                          <td className="px-2 py-2 font-semibold">{row.efficiencyScore}</td>
                        </tr>
                      ))}
                      {(stats.weeklyEfficiency || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-gray-500">Sin datos semanales por ahora.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="digital-card-soft rounded-lg border border-[#ffe0b2] bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-[#e65100]">Eficiencia mensual</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[#ef6c00]">
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Técnico</th>
                        <th className="px-2 py-2">Reparaciones</th>
                        <th className="px-2 py-2">Prom. Horas</th>
                        <th className="px-2 py-2">Puntaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.monthlyEfficiency || []).map((row: EfficiencyItem) => (
                        <tr key={`month-${row.rank}-${row.technician}`} className="border-b last:border-b-0">
                          <td className="px-2 py-2 font-semibold text-[#ef6c00]">{row.rank}</td>
                          <td className="px-2 py-2 text-[#1a4d2e]">{row.technician}</td>
                          <td className="px-2 py-2">{row.completedRepairs}</td>
                          <td className="px-2 py-2">{row.averageResolutionHours}</td>
                          <td className="px-2 py-2 font-semibold">{row.efficiencyScore}</td>
                        </tr>
                      ))}
                      {(stats.monthlyEfficiency || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-gray-500">Sin datos mensuales por ahora.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="digital-tabs grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="digital-tab-trigger">
              Pendientes ({pendingTickets.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="digital-tab-trigger">
              {`Completados (${completedTickets.length})`}
            </TabsTrigger>
            <TabsTrigger value="mis-tareas" className="digital-tab-trigger">
              Mis Tareas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingTickets.length === 0 ? (
              <div className="rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-8 text-center">
                <p className="text-[#2d7a4f]">No hay tickets pendientes. ¡Buen trabajo!</p>
              </div>
            ) : (
              pendingTickets.map((ticket) => (
                (() => {
                  const currentUserId = currentUser?.id ? Number(currentUser.id) : null
                  const assignedToOther = Boolean(
                    ticket.assignedTechnicianId &&
                    !isAdmin() &&
                    ticket.assignedTechnicianId !== currentUserId
                  )

                  return (
                <div
                  key={ticket.id}
                  className="digital-card digital-card-interactive rounded-lg border-2 border-[#ffd54f] p-4"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{ticket.id}
                      </h3>
                      <p className="text-sm text-[#2d7a4f]">
                        {ticket.personName} ({ticket.personId})
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadPdf(ticket.id)}
                      className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600"
                    >
                      <Download className="size-4" />
                      PDF
                    </button>
                  </div>

                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-gray-500">Equipo</p>
                      <p className="font-medium text-[#1a4d2e]">{ticket.equipmentType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Tipo de Daño</p>
                      <p className="font-medium text-[#1a4d2e]">{ticket.damageType}</p>
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e3f2fd] px-2 py-1 text-[#1565c0]">
                      <Timer className="size-3" />
                      tiempo de {ticket.slaDays} dias
                    </span>
                    {ticket.dueDate && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                        Límite: {new Date(ticket.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {ticket.timeAlert && (
                      <span className={`rounded-full px-2 py-1 font-semibold ${ticket.timeAlertLevel === 'VENCIDO' ? 'bg-[#ffebee] text-[#c62828]' : 'bg-[#fff3e0] text-[#ef6c00]'}`}>
                        {ticket.timeAlertLevel === 'VENCIDO' ? 'Vencido' : 'Por vencer'}
                      </span>
                    )}
                  </div>

                  {ticket.timeAlertMessage && (
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${ticket.timeAlertLevel === 'VENCIDO' ? 'border-[#ef9a9a] bg-[#ffebee] text-[#b71c1c]' : 'border-[#ffcc80] bg-[#fff8e1] text-[#e65100]'}`}>
                      {ticket.timeAlertMessage}
                    </div>
                  )}

                  <p className="mb-4 text-sm text-gray-600">{ticket.description}</p>

                  {selectedTicket?.id === ticket.id ? (
                    <div className="digital-card space-y-3 rounded-lg bg-[#f5f5f5] p-3">
                      <p className="text-sm font-semibold text-[#1a4d2e]">Formato de orden de servicio</p>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">Datos del funcionario</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            value={serviceForm.dependencia || ''}
                            onChange={(e) => setServiceForm((prev) => ({ ...prev, dependencia: e.target.value }))}
                            placeholder="Dependencia *"
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                          <input
                            value={serviceForm.orden_servicio_no || ''}
                            placeholder="Numero del ticket"
                            className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                            readOnly
                          />
                          <input
                            value={ticket.personName || ''}
                            placeholder="Solicitante / funcionario"
                            className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                            readOnly
                          />
                        </div>

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <input
                            value={ticket.equipmentType || ''}
                            placeholder="Tipo de equipo"
                            className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                            readOnly
                          />
                        </div>

                        <textarea
                          value={ticket.description || ''}
                          placeholder="Observación inicial del solicitante"
                          className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                          rows={3}
                          readOnly
                        />
                      </div>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">Datos del equipo</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            value={serviceForm.datos_equipo || ''}
                            placeholder="Tipo / datos del equipo"
                            className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                            readOnly
                          />
                          <input
                            value={serviceForm.modelo || ''}
                            onChange={(e) => setServiceForm((prev) => ({ ...prev, modelo: e.target.value }))}
                            placeholder="Modelo"
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                          <input
                            value={serviceForm.serial || ''}
                            onChange={(e) => setServiceForm((prev) => ({ ...prev, serial: e.target.value }))}
                            placeholder="Numero de usuario / Serial"
                            required
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">Soporte técnico</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            value={serviceForm.fecha || ''}
                            onChange={(e) => setServiceForm((prev) => ({ ...prev, fecha: e.target.value }))}
                            type="date"
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                          <input
                            value={serviceForm.soporte_realizo || ''}
                            onChange={(e) => setServiceForm((prev) => ({ ...prev, soporte_realizo: e.target.value }))}
                            placeholder="Soporte realizado por"
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">Soporte realizado</p>
                        <textarea
                          value={procedureDescription}
                          onChange={(e) => {
                            setProcedureDescription(e.target.value)
                            setServiceForm((prev) => ({ ...prev, soporte_descripcion: e.target.value }))
                          }}
                          placeholder="Descripción del soporte realizado..."
                          className="mt-2 w-full rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          rows={4}
                        />
                      </div>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">Recomendaciones</p>
                        <textarea
                          value={serviceForm.recomendaciones || ''}
                          onChange={(e) => setServiceForm((prev) => ({ ...prev, recomendaciones: e.target.value }))}
                          placeholder="Recomendaciones adicionales"
                          className="w-full rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          rows={3}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCompleteTicket(ticket)}
                          disabled={completingTicket === ticket.id}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#81c784] px-3 py-2 text-white transition hover:bg-[#66bb6a] disabled:opacity-50"
                        >
                          {completingTicket === ticket.id ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Completando...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="size-4" />
                              Completar
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTicket(null)
                            setProcedureDescription('')
                            setServiceForm({})
                          }}
                          className="rounded-lg bg-gray-400 px-3 py-2 text-white hover:bg-gray-500"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assignedToOther && (
                        <p className="text-xs font-semibold text-[#c62828]">
                          Asignado a: {ticket.assignedTechnicianName || 'otro técnico'}
                        </p>
                      )}
                      <button
                        onClick={() => openResolverForm(ticket)}
                        disabled={assignedToOther}
                        className={`w-full rounded-lg py-2 font-semibold transition ${assignedToOther ? 'cursor-not-allowed bg-gray-300 text-gray-600' : 'bg-[#ffd54f] text-[#1a4d2e] hover:bg-[#ffb300]'}`}
                      >
                        {assignedToOther ? 'Ya asignado' : 'Resolver'}
                      </button>
                    </div>
                  )}
                </div>
                  )
                })()
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {visibleCompletedTickets.length === 0 ? (
              <div className="rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-8 text-center">
                <p className="text-[#2d7a4f]">
                  No hay tickets completados.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-[#c8e6c9] bg-[#f7fff8] p-3">
                  <p className="text-sm font-semibold text-[#1a4d2e]">Hoy ({formatDayLabel(todayDateKey)}): {todayCompletedTickets.length} ticket(s)</p>
                </div>

                <div className="space-y-3">
                  {todayCompletedTickets.length > 0 ? todayCompletedTickets.map(renderCompletedTicketCard) : (
                    <p className="rounded-lg border border-[#dcedc8] bg-white p-3 text-sm text-[#2d7a4f]">Sin tickets completados hoy.</p>
                  )}
                </div>

                {historicalCompletedEntries.length > 0 && (
                  <details className="rounded-lg border border-[#c8e6c9] bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[#1a4d2e]">Ver días anteriores ({historicalCompletedEntries.length})</summary>
                    <div className="mt-3 space-y-3">
                      {historicalCompletedEntries.map(([day, dayTickets]) => (
                        <details key={`day-${day}`} className="rounded-md border border-[#e0f2f1] bg-[#f7fff8] p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-[#2d7a4f]">{formatDayLabel(day)} ({dayTickets.length})</summary>
                          <div className="mt-3 space-y-3">
                            {dayTickets.map(renderCompletedTicketCard)}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mis-tareas" className="space-y-4">
            <MisTareas
              usuarioId={currentUser?.id ? Number(currentUser.id) : 0}
              selectedTareaId={selectedTaskId}
              onResolveTicket={handleResolveAssignedTicket}
              onTaskUpdated={() => {
                loadData(false)
              }}
            />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
