import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Ticket, FormatoServicio, Statistics, InventoryStockForDelivery } from '@/lib/api'
import {
  getTickets,
  completeTicket,
  setTicketInProgress,
  downloadTicketPdf,
  viewTicketPdf,
  getStatistics,
  clearAuth,
  isAdmin,
  getCurrentUser,
  getCurrentUserDisplayName,
  getInventoryStockForDelivery,
} from '@/lib/api'
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
  const [fichaTicketId, setFichaTicketId] = useState<number | null>(null)
  const [startingProcessId, setStartingProcessId] = useState<number | null>(null)
  const [procedureDescription, setProcedureDescription] = useState('')
  const [serviceForm, setServiceForm] = useState<Partial<FormatoServicio>>({})
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [showChatModal, setShowChatModal] = useState(false)
  const [inventoryStock, setInventoryStock] = useState<InventoryStockForDelivery[]>([])
  const [selectedInsumos, setSelectedInsumos] = useState<Array<{ stock_id: number; nombre: string; cantidad: number }>>([])
  const [showInventoryPickerModal, setShowInventoryPickerModal] = useState(false)
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
      const stockData = await getInventoryStockForDelivery()
      setInventoryStock(stockData)
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
      toast.error('Completa la descripción del soporte realizado en la ficha')
      return
    }

    if (!serviceForm.dependencia?.trim()) {
      toast.error('La dependencia es obligatoria en la ficha')
      return
    }

    if (!serviceForm.serial?.trim()) {
      toast.error('El número de usuario / serial es obligatorio en la ficha')
      return
    }

    if (!serviceForm.modelo?.trim()) {
      toast.error('Indica el modelo del equipo en la ficha')
      return
    }

    if (!serviceForm.soporte_realizo?.trim()) {
      toast.error('Indica quién realizó el soporte (campo en la ficha)')
      return
    }

    if (!serviceForm.fecha?.trim()) {
      toast.error('Indica la fecha del servicio en la ficha')
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
        inventoryItems: selectedInsumos,
      })
      toast.success('Ticket completado exitosamente')
      setProcedureDescription('')
      setServiceForm({})
      setFichaTicketId(null)
      setSelectedInsumos([])
      setShowInventoryPickerModal(false)
      setActiveTab('completed')
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

  const assertCanWorkTicket = (ticket: Ticket) => {
    const currentUserId = currentUser?.id ? Number(currentUser.id) : null
    const assignedToOther = Boolean(
      ticket.assignedTechnicianId &&
      !isAdmin() &&
      ticket.assignedTechnicianId !== currentUserId
    )
    if (assignedToOther) {
      toast.error(`Este ticket ya está asignado a ${ticket.assignedTechnicianName || 'otro técnico'}.`)
      return false
    }
    return true
  }

  const handleStartEnProceso = async (ticket: Ticket) => {
    if (!assertCanWorkTicket(ticket)) return
    if (ticket.status !== 'ABIERTO') {
      toast.error('Este ticket ya no está abierto.')
      return
    }
    setStartingProcessId(ticket.id)
    try {
      await setTicketInProgress(ticket.id)
      toast.success('Ticket en proceso. Abre la ficha técnica para continuar.')
      setFichaTicketId(null)
      await loadData(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el estado')
    } finally {
      setStartingProcessId(null)
    }
  }

  const openFichaForTicket = (ticket: Ticket) => {
    if (!assertCanWorkTicket(ticket)) return
    if (ticket.status !== 'EN_PROCESO') {
      toast.error('Primero pasa el ticket a En proceso.')
      return
    }
    const now = new Date().toISOString().slice(0, 10)
    const sessionName = getCurrentUserDisplayName()
    const savedSoporte =
      (ticket.formatoServicio?.soporte_realizo && ticket.formatoServicio.soporte_realizo.trim()) ||
      (ticket.formatoServicio?.diagnostico_realizo && ticket.formatoServicio.diagnostico_realizo.trim()) ||
      ''
    setServiceForm({
      dependencia: ticket.formatoServicio?.dependencia || '',
      orden_servicio_no: ticket.formatoServicio?.orden_servicio_no || `${ticket.id}`,
      datos_equipo: ticket.formatoServicio?.datos_equipo || ticket.equipmentType,
      modelo: (ticket.formatoServicio?.modelo || '').trim() || ticket.equipmentModel || '',
      serial: (ticket.formatoServicio?.serial || '').trim() || ticket.equipmentSerial || '',
      fecha: ticket.formatoServicio?.fecha || now,
      soporte_realizo: sessionName || savedSoporte,
      soporte_descripcion: ticket.formatoServicio?.soporte_descripcion || procedureDescription,
      nombre_funcionario: ticket.personName,
    })
    setProcedureDescription(ticket.procedimiento || '')
    setSelectedInsumos(
      Array.isArray(ticket.formatoServicio?.insumos)
        ? (ticket.formatoServicio!.insumos as Array<{ stock_id: number; nombre: string; cantidad: number }>)
        : [],
    )
    setFichaTicketId(ticket.id)
  }
  const addInsumo = (stockId: number) => {
    const stock = inventoryStock.find((item) => item.id === stockId)
    if (!stock) return
    setSelectedInsumos((prev) => {
      const exists = prev.find((i) => i.stock_id === stockId)
      if (exists) {
        return prev.map((i) => i.stock_id === stockId ? { ...i, cantidad: i.cantidad + 1 } : i)
      }
      return [
        ...prev,
        {
          stock_id: stockId,
          nombre: [stock.producto || stock.tipo, stock.referencia_fabricante].filter(Boolean).join(' · ') || stock.tipo,
          cantidad: 1,
        },
      ]
    })
  }

  const updateInsumoQty = (stockId: number, qty: number) => {
    const stock = inventoryStock.find((item) => item.id === stockId)
    const max = stock?.cantidad_actual ?? 999_999
    setSelectedInsumos((prev) =>
      prev.map((i) =>
        i.stock_id === stockId ? { ...i, cantidad: Math.max(1, Math.min(qty || 1, max)) } : i,
      ),
    )
  }

  const removeInsumo = (stockId: number) => {
    setSelectedInsumos((prev) => prev.filter((i) => i.stock_id !== stockId))
  }

  const handleLogout = () => {
    clearAuth()
    onLogout()
  }

  const handleNotificationClick = (tareaId: number) => {
    setSelectedTaskId(tareaId)
    setActiveTab('mis-tareas')
  }

  const handleTicketTakenByTechnician = async (ticketId: number) => {
    const { tickets: fresh } = await getTickets()
    const ticket = fresh.find((t) => t.id === ticketId)
    if (!ticket) return
    if (!assertCanWorkTicket(ticket)) return
    if (ticket.status === 'ABIERTO') {
      await setTicketInProgress(ticketId)
      await loadData(false)
    }
  }

  const handleResolveAssignedTicket = async (ticketId: number) => {
    try {
      const { tickets: fresh } = await getTickets()
      setTickets(fresh)
      const ticket = fresh.find((t) => t.id === ticketId)
      if (!ticket) {
        toast.error('No se encontro el ticket asignado en la lista de pendientes.')
        return
      }
      setActiveTab('pending')
      if (ticket.status === 'ABIERTO') {
        if (!assertCanWorkTicket(ticket)) return
        await setTicketInProgress(ticket.id)
        toast.success('Ticket en proceso. Abre la ficha técnica para continuar.')
        setFichaTicketId(null)
        await loadData(false)
      } else if (ticket.status === 'EN_PROCESO') {
        openFichaForTicket(ticket)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir el ticket')
    }
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

  /** Día calendario en que quedó cerrado (no el día en que se abrió el ticket). */
  const ticketCompletedDayKey = (ticket: Ticket) => {
    const raw = ticket.formatoServicio?.fecha_cierre
    if (typeof raw === 'string' && raw.trim()) {
      return toLocalDateKey(raw)
    }
    return toLocalDateKey(ticket.createdAt)
  }

  const ticketClosedSortTime = (ticket: Ticket) => {
    const raw = ticket.formatoServicio?.fecha_cierre
    if (typeof raw === 'string' && raw.trim()) {
      return new Date(raw).getTime()
    }
    return new Date(ticket.createdAt).getTime()
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
  const sortedCompletedTickets = [...visibleCompletedTickets].sort(
    (a, b) => ticketClosedSortTime(b) - ticketClosedSortTime(a),
  )
  const completedByDay = sortedCompletedTickets.reduce((acc, ticket) => {
    const key = ticketCompletedDayKey(ticket)
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
            {ticket.numeroFichaTecnica != null && (
              <span className="ml-2 text-sm font-normal text-[#0f4a2e]">
                · Ficha TIC {String(ticket.numeroFichaTecnica).padStart(8, '0')}
              </span>
            )}
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
            Vista previa
          </button>
          <button
            onClick={() => handleDownloadPdf(ticket.id)}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600"
          >
            <Download className="size-4" />
            Descargar PDF
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <NotificationBar
        onNotificationClick={handleNotificationClick}
        onChatNotificationClick={() => setShowChatModal(true)}
      />
      <div className="mx-auto max-w-6xl p-4">
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="absolute left-0 top-0 h-full w-1 bg-green-700" aria-hidden />

          <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
                    <Cpu className="size-3.5 text-green-700" />
                    Nodo técnico TIC
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
                    {isAdmin() ? 'Panel administrador' : 'Área de técnicos'}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-zinc-600 md:text-base">
                    {isAdmin() ? 'Gestión de tickets y estadísticas' : 'Gestiona y resuelve tickets de soporte'}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <LogOut className="size-4" />
                  Cerrar sesión
                </button>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Pendientes</p>
                  <p className="font-mono text-xl font-semibold text-zinc-900">{pendingTickets.length.toString().padStart(2, '0')}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Completados</p>
                  <p className="font-mono text-xl font-semibold text-zinc-900">{completedTickets.length.toString().padStart(2, '0')}</p>
                </div>
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-amber-900/70">Alertas tiempo</p>
                  <p className="font-mono text-xl font-semibold text-amber-950">{pendingAlerts.length.toString().padStart(2, '0')}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                  <Activity className="size-3.5 text-green-700" /> En línea
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1">
                  <ShieldCheck className="size-3.5 text-zinc-500" /> Sesión activa
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[11.5rem] md:max-w-[13.5rem]">
              <button
                type="button"
                onClick={() => setShowChatModal(true)}
                className="relative w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:shadow-md"
              >
                <img
                  src={robotMascot}
                  alt="Robot TIC"
                  className="robot-clean loader-robot mx-auto h-32 w-32 object-contain md:h-36 md:w-36"
                />
                <p className="mt-2 text-center text-[11px] font-medium text-zinc-700">Asistente TIC</p>
                <p className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white py-1 text-[10px] font-medium text-zinc-700">
                  <MessageSquare className="size-3" /> Chat interno
                </p>
              </button>
            </div>
          </div>
        </div>

        {showChatModal &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] md:p-5"
              role="presentation"
              onClick={() => setShowChatModal(false)}
            >
              <div
                className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-xl md:p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tic-chat-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between md:mb-3">
                  <h2 id="tic-chat-modal-title" className="text-lg font-semibold text-zinc-900">
                    Chat interno
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowChatModal(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100"
                  >
                    <X className="size-3.5" /> Cerrar
                  </button>
                </div>
                <InternalChatPanel />
              </div>
            </div>,
            document.body,
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
          <TabsList className="digital-tabs grid w-full grid-cols-1 sm:grid-cols-3">
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
                  className={`digital-card digital-card-interactive rounded-lg border-2 p-4 ${
                    ticket.demoradoPublico
                      ? 'border-[#e53935] bg-[#ffebee] ring-1 ring-red-200'
                      : 'border-[#ffd54f]'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{ticket.id}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            ticket.status === 'EN_PROCESO'
                              ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/60'
                              : 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/80'
                          }`}
                        >
                          {ticket.status === 'EN_PROCESO' ? 'En proceso' : 'Abierto'}
                        </span>
                        {ticket.demoradoPublico && (
                          <span className="rounded-full bg-[#c62828] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            Demorado
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-[#2d7a4f]">
                        {ticket.personName} ({ticket.personId})
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewPdf(ticket.id)}
                        className="rounded-lg bg-indigo-500 px-3 py-1 text-sm text-white transition hover:bg-indigo-600"
                      >
                        Ver ficha
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(ticket.id)}
                        className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600"
                      >
                        <Download className="size-4" />
                        Descargar
                      </button>
                    </div>
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

                  {fichaTicketId === ticket.id ? (
                    <div className="digital-card min-w-0 space-y-3 rounded-lg bg-[#f5f5f5] p-2.5 sm:p-3">
                      <p className="text-sm font-semibold text-[#1a4d2e]">Formato de orden de servicio</p>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-2.5 sm:p-3">
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

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-2.5 sm:p-3">
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
                            placeholder="Modelo *"
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

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-2.5 sm:p-3">
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
                            placeholder="Soporte realizado por *"
                            title="Se rellena con el nombre de tu cuenta; puedes corregirlo si hace falta."
                            className="rounded-lg border border-[#81c784] bg-white px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-2.5 sm:p-3">
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

                      <div className="digital-card-soft rounded-lg border border-[#dcedc8] bg-white p-2.5 sm:p-3">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#2d7a4f]">
                          Productos del inventario usados en el ticket
                        </p>
                        <p className="mb-3 text-[11px] text-zinc-600">
                          En el menú <strong>Inventario</strong> solo verás si hay stock. Para escoger implementos en este servicio, usa el botón de abajo; se guardan al completar el ticket y salen en el PDF.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowInventoryPickerModal(true)}
                          className="w-full rounded-lg border border-[#85d79a] bg-[#effff3] px-4 py-2.5 text-sm font-semibold text-[#0f7f43] transition hover:bg-[#dffbe8]"
                        >
                          Ver productos del inventario
                        </button>
                        {selectedInsumos.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-lg border border-[#d8f2df] bg-[#f8fff9] p-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2d7a4f]">Escogidos para este ticket</p>
                            {selectedInsumos.map((item) => (
                              <div key={item.stock_id} className="flex flex-wrap items-center gap-2">
                                <span className="min-w-0 flex-1 text-sm text-[#1a4d2e]">{item.nombre}</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={inventoryStock.find((s) => s.id === item.stock_id)?.cantidad_actual ?? undefined}
                                  value={item.cantidad}
                                  onChange={(e) => updateInsumoQty(item.stock_id, Number(e.target.value))}
                                  className="w-20 rounded-lg border border-[#81c784] px-2 py-1"
                                />
                                <button type="button" onClick={() => removeInsumo(item.stock_id)} className="w-full rounded bg-red-100 px-2 py-1 text-xs text-red-700 sm:w-auto">
                                  Quitar
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {showInventoryPickerModal && (
                        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-2.5 sm:p-4">
                          <div className="flex max-h-[min(92vh,720px)] w-full max-w-4xl min-w-0 flex-col rounded-2xl border border-[#a8dfb6] bg-[linear-gradient(170deg,#ffffff_0%,#f3fff3_70%,#fffde8_100%)] p-3 shadow-xl sm:p-5 md:p-6">
                            <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2f7d52]">Stock disponible</p>
                                <h3 className="text-lg font-black text-[#16422a] sm:text-xl">Ver productos del inventario</h3>
                                <p className="mt-1 text-xs text-[#2b6a46] sm:text-sm">
                                  Pulsa <strong>Escoger</strong> para sumar al ticket (puedes repetir para aumentar cantidad hasta el máximo en stock).
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowInventoryPickerModal(false)}
                                className="rounded-lg border border-[#b7e8c5] bg-white px-3 py-1.5 text-sm font-semibold text-[#1d613c]"
                              >
                                Listo
                              </button>
                            </div>
                            <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-[#c8eecf] bg-white">
                              <table className="min-w-full text-sm">
                                <thead className="sticky top-0 z-[1] bg-[#ecfff1] text-left text-[#175638]">
                                  <tr>
                                    <th className="px-3 py-2 font-bold">Nombre</th>
                                    <th className="px-3 py-2 font-bold">Tipo</th>
                                    <th className="px-3 py-2 font-bold">Referencia</th>
                                    <th className="px-3 py-2 font-bold">En stock</th>
                                    <th className="px-3 py-2 font-bold">Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {inventoryStock.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-4 py-6 text-center text-[#2d7a4f]">No hay líneas de stock disponibles.</td>
                                    </tr>
                                  )}
                                  {inventoryStock.map((stock) => (
                                    <tr key={stock.id} className="border-t border-[#edf7ef] text-[#1f5f3b]">
                                      <td className="px-3 py-2">{stock.producto || stock.tipo || '—'}</td>
                                      <td className="px-3 py-2">{stock.tipo || '-'}</td>
                                      <td className="px-3 py-2 font-mono text-xs">{stock.referencia_fabricante || '—'}</td>
                                      <td className="px-3 py-2 font-semibold">{stock.cantidad_actual}</td>
                                      <td className="px-3 py-2">
                                        <button
                                          type="button"
                                          onClick={() => addInsumo(stock.id)}
                                          disabled={stock.cantidad_actual < 1}
                                          className="rounded-lg border border-[#85d79a] bg-[#effff3] px-2.5 py-1 text-xs font-semibold text-[#0f7f43] hover:bg-[#dffbe8] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Escoger
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row">
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
                          type="button"
                          onClick={() => {
                            setFichaTicketId(null)
                            setProcedureDescription('')
                            setServiceForm({})
                            setSelectedInsumos([])
                            setShowInventoryPickerModal(false)
                          }}
                          className="rounded-lg bg-gray-400 px-3 py-2 text-white hover:bg-gray-500"
                        >
                          Cerrar ficha
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
                      {ticket.status === 'ABIERTO' && (
                        <button
                          type="button"
                          onClick={() => void handleStartEnProceso(ticket)}
                          disabled={assignedToOther || startingProcessId === ticket.id}
                          className={`w-full rounded-lg py-2.5 text-sm font-semibold transition ${
                            assignedToOther || startingProcessId === ticket.id
                              ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                              : 'bg-green-700 text-white hover:bg-green-800'
                          }`}
                        >
                          {startingProcessId === ticket.id ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <Loader2 className="size-4 animate-spin" />
                              Pasando a proceso…
                            </span>
                          ) : assignedToOther ? (
                            'Ya asignado'
                          ) : (
                            'Pasar a en proceso'
                          )}
                        </button>
                      )}
                      {ticket.status === 'EN_PROCESO' && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => openFichaForTicket(ticket)}
                            disabled={assignedToOther}
                            className={`w-full rounded-lg border-2 py-2.5 text-sm font-semibold transition ${
                              fichaTicketId === ticket.id
                                ? 'border-green-800 bg-green-50 text-green-900'
                                : 'border-zinc-300 bg-white text-zinc-900 hover:border-green-600 hover:bg-green-50/50'
                            } ${assignedToOther ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            Llenar ficha técnica
                          </button>
                          <p className="text-xs text-zinc-600">
                            El ticket se cierra solo desde esta ficha cuando esté completa (incluidos los campos obligatorios) y pulses <strong>Completar</strong>.
                            Para consultar existencias sin escoger, abre el módulo <strong>Inventario</strong>. Para escoger productos en el servicio, hazlo en la ficha con <strong>Ver productos del inventario</strong>.
                          </p>
                        </div>
                      )}
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
                    <p className="rounded-lg border border-[#dcedc8] bg-white p-3 text-sm text-[#2d7a4f]">
                      No hay cierres con fecha de hoy. Despliega «Ver días anteriores» si buscas tickets cerrados en otras fechas.
                    </p>
                  )}
                </div>

                {historicalCompletedEntries.length > 0 && (
                  <details className="rounded-lg border border-[#c8e6c9] bg-white p-3" open={todayCompletedTickets.length === 0 && visibleCompletedTickets.length > 0}>
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
              onTicketTaken={handleTicketTakenByTechnician}
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
