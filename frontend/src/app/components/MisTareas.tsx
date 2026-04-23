import { useState, useEffect, useCallback } from 'react'
import { obtenerMisTareas, actualizarTarea } from '@/lib/tareas'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { toast } from 'sonner'
import { Loader2, CheckCircle, Clock, AlertCircle, Cpu } from 'lucide-react'

interface Tarea {
  id: number
  ticket: number
  ticket_id: number
  usuario_asignado: number
  usuario_nombre: string
  asignado_por: string
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'FINALIZADA'
  fecha_asignacion: string
  fecha_finalizacion: string | null
  /** Plazo fijado por el administrador (ISO). */
  plazo_hasta?: string | null
  observaciones: string
  equipo_tipo: string
  equipo_serie: string
  descripcion: string
}

function textoPlazoRestante(plazoHasta: string | null | undefined): string | null {
  if (!plazoHasta?.trim()) return null
  const end = new Date(plazoHasta).getTime()
  if (Number.isNaN(end)) return null
  const ms = end - Date.now()
  if (ms <= 0) {
    return 'El plazo fijado por el administrador ya venció; prioriza esta tarea.'
  }
  const totalMin = Math.ceil(ms / 60_000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin - days * 24 * 60) / 60)
  const mins = totalMin - days * 24 * 60 - hours * 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} día${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`)
  if (days === 0 && hours === 0 && mins > 0) parts.push(`${mins} minuto${mins === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push('menos de un minuto')
  return `Tienes ${parts.join(' y ')} para atender (plazo del administrador).`
}

function PlazoTareaBanner({
  plazoHasta,
  className = 'mt-2',
}: {
  plazoHasta?: string | null
  className?: string
}) {
  const msg = textoPlazoRestante(plazoHasta)
  if (!msg) return null
  const vencido = msg.includes('venció')
  return (
    <p
      className={`${className} rounded-md border px-2 py-1.5 text-xs font-semibold ${
        vencido ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-950'
      }`}
    >
      {msg}
    </p>
  )
}

interface MisTareasProps {
  usuarioId: number
  selectedTareaId?: number | null
  onResolveTicket?: (ticketId: number) => void | Promise<void>
  /** Tras «Tomar ticket»: poner el ticket en EN_PROCESO en el servidor (desacoplado del estado de la tarea). */
  onTicketTaken?: (ticketId: number) => void | Promise<void>
  onTaskUpdated?: () => void
}

export function MisTareas({ usuarioId, selectedTareaId, onResolveTicket, onTicketTaken, onTaskUpdated }: MisTareasProps) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [activeTaskTab, setActiveTaskTab] = useState('pendientes')
  const [, setPlazoTick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setPlazoTick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const cargarTareas = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true)
    }

    try {
      const data = await obtenerMisTareas(usuarioId)
      const nextTareas = Array.isArray(data) ? data : []
      setTareas(nextTareas)
      setExpandedId((currentExpandedId) => {
        if (!currentExpandedId) return currentExpandedId
        return nextTareas.some((tarea) => tarea.id === currentExpandedId) ? currentExpandedId : null
      })
    } catch (error) {
      if (showLoader) {
        toast.error('Error al cargar las tareas')
      }
      console.error(error)
      setTareas([])
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [usuarioId])

  useEffect(() => {
    cargarTareas()

    const interval = window.setInterval(() => {
      cargarTareas(false)
    }, 10000)

    return () => window.clearInterval(interval)
  }, [cargarTareas])

  useEffect(() => {
    if (!selectedTareaId || tareas.length === 0) return

    const selectedTask = tareas.find((tarea) => tarea.id === selectedTareaId)
    if (!selectedTask) return

    setExpandedId(selectedTask.id)

    if (selectedTask.estado === 'EN_PROCESO') {
      setActiveTaskTab('en-proceso')
      return
    }

    if (selectedTask.estado === 'FINALIZADA') {
      setActiveTaskTab('en-proceso')
      return
    }

    setActiveTaskTab('pendientes')
  }, [selectedTareaId, tareas])

  const cambiarEstado = async (tareaId: number, nuevoEstado: string): Promise<boolean> => {
    setUpdatingId(tareaId)
    try {
      await actualizarTarea(tareaId, { estado: nuevoEstado })
      toast.success('Tarea actualizada correctamente')
      await cargarTareas()
      onTaskUpdated?.()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la tarea')
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  const abrirFichaTecnica = async (tarea: Tarea) => {
    if (!onResolveTicket) return
    if (tarea.estado !== 'EN_PROCESO') {
      toast.error('Primero toma el ticket en la pestaña Pendientes.')
      return
    }
    await onResolveTicket(tarea.ticket_id)
  }

  const iniciarTarea = async (tarea: Tarea) => {
    if (tarea.estado !== 'PENDIENTE') return
    const ok = await cambiarEstado(tarea.id, 'EN_PROCESO')
    if (!ok) return
    if (onTicketTaken) {
      try {
        await onTicketTaken(tarea.ticket_id)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo marcar el ticket en proceso')
      }
    }
  }

  const tareasPendientes = tareas.filter((t) => t.estado === 'PENDIENTE')
  const tareasEnProceso = tareas.filter((t) => t.estado === 'EN_PROCESO')
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#2d7a4f]" />
      </div>
    )
  }

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE':
        return <AlertCircle className="size-5 text-yellow-500" />
      case 'EN_PROCESO':
        return <Clock className="size-5 text-blue-500" />
      case 'FINALIZADA':
        return <CheckCircle className="size-5 text-green-500" />
      default:
        return null
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE':
        return 'border-[#f2cf84] bg-[#fffdf0]'
      case 'EN_PROCESO':
        return 'border-[#8fd8de] bg-[#f0feff]'
      case 'FINALIZADA':
        return 'border-[#9ddb9f] bg-[#f4fff1]'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  return (
    <div className="space-y-4">
      <div className="digital-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1 rounded-full border border-[#9ddcdf] bg-[#ecffff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#136d72]">
              <Cpu className="size-3" /> Cola de operaciones
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#124b4f]">Mis Tareas Asignadas</h2>
            <p className="text-sm text-[#2d7478]">Centro táctico de tareas del técnico</p>
          </div>

          <div className="grid min-w-[180px] grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#f1cf88] bg-[#fffdf0] px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7c661e]">Pendientes</p>
              <p className="font-mono text-lg font-black text-[#5e4c16]">{tareasPendientes.length.toString().padStart(2, '0')}</p>
            </div>
            <div className="rounded-xl border border-[#95d8dc] bg-[#effdff] px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#146c71]">En proceso</p>
              <p className="font-mono text-lg font-black text-[#0f5358]">{tareasEnProceso.length.toString().padStart(2, '0')}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTaskTab} onValueChange={setActiveTaskTab} className="space-y-4">
        <TabsList className="digital-tabs grid w-full grid-cols-2">
          <TabsTrigger value="pendientes" className="digital-tab-trigger">
            Pendientes ({tareasPendientes.length})
          </TabsTrigger>
          <TabsTrigger value="en-proceso" className="digital-tab-trigger">
            En Proceso ({tareasEnProceso.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4">
          {tareasPendientes.length === 0 ? (
            <div className="digital-card rounded-lg border-2 border-[#f1cf88] bg-[#fffef5] p-6 text-center">
              <p className="text-[#7b651a]">No hay tareas pendientes</p>
            </div>
          ) : (
            tareasPendientes.map((tarea) => (
              <div
                key={tarea.id}
                className={`digital-card digital-card-interactive cursor-pointer rounded-lg border-2 p-4 transition ${getEstadoColor(tarea.estado)}`}
                onClick={() => setExpandedId(expandedId === tarea.id ? null : tarea.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(tarea.estado)}
                      <h3 className="text-lg font-black text-[#124b4f]">
                        Ticket #{tarea.ticket_id}
                      </h3>
                      <span className="rounded-full border border-[#f2cf84] bg-[#fff8dd] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b651a]">
                        Pendiente
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#305f61]">
                      Equipo: {tarea.equipo_tipo} - {tarea.equipo_serie}
                    </p>
                    <PlazoTareaBanner plazoHasta={tarea.plazo_hasta} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void iniciarTarea(tarea)
                    }}
                    disabled={updatingId === tarea.id}
                    className="rounded-lg border border-[#87d4d8] bg-[linear-gradient(145deg,#22bcc4_0%,#77db6f_100%)] px-3 py-1 text-sm font-semibold text-[#083f43] shadow-[0_8px_20px_rgba(20,158,164,0.22)] transition hover:brightness-105 disabled:opacity-50"
                  >
                    {updatingId === tarea.id ? 'Actualizando...' : 'Tomar ticket'}
                  </button>
                </div>

                {expandedId === tarea.id && (
                  <div className="mt-4 space-y-2 border-t border-[#b7dfe1] pt-3">
                    <p className="text-sm text-[#214a4c]">
                      <strong>Descripción:</strong> {tarea.descripcion}
                    </p>
                    <p className="text-xs text-[#3f7072]">
                      Asignado por: {tarea.asignado_por}
                    </p>
                    {tarea.observaciones && (
                      <p className="text-sm text-[#214a4c]">
                        <strong>Observaciones:</strong> {tarea.observaciones}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="en-proceso" className="space-y-4">
          {tareasEnProceso.length === 0 ? (
            <div className="digital-card rounded-lg border-2 border-[#8fd8de] bg-[#f0feff] p-6 text-center">
              <p className="text-[#15696e]">No hay tareas en proceso</p>
            </div>
          ) : (
            tareasEnProceso.map((tarea) => (
              <div
                key={tarea.id}
                className={`digital-card digital-card-interactive cursor-pointer rounded-lg border-2 p-4 transition ${getEstadoColor(tarea.estado)}`}
                onClick={() => setExpandedId(expandedId === tarea.id ? null : tarea.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(tarea.estado)}
                      <h3 className="text-lg font-black text-[#124b4f]">
                        Ticket #{tarea.ticket_id}
                      </h3>
                      <span className="rounded-full border border-[#8fd8de] bg-[#e9fdff] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#15696e]">
                        En proceso
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#305f61]">
                      Equipo: {tarea.equipo_tipo} - {tarea.equipo_serie}
                    </p>
                    <PlazoTareaBanner plazoHasta={tarea.plazo_hasta} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      abrirFichaTecnica(tarea)
                    }}
                    disabled={updatingId === tarea.id}
                    className="rounded-lg border border-[#85d4d7] bg-[linear-gradient(145deg,#13b7c0_0%,#69d6de_54%,#b4e86a_100%)] px-3 py-1 text-sm font-semibold text-[#083f43] shadow-[0_8px_20px_rgba(20,158,164,0.2)] transition hover:brightness-105 disabled:opacity-50"
                  >
                    {updatingId === tarea.id ? 'Abriendo...' : 'Revisar ticket'}
                  </button>
                </div>

                {expandedId === tarea.id && (
                  <div className="mt-4 space-y-2 border-t border-[#b7dfe1] pt-3">
                    <p className="text-sm text-[#214a4c]">
                      <strong>Descripción:</strong> {tarea.descripcion}
                    </p>
                    <p className="text-xs text-[#3f7072]">
                      Asignado por: {tarea.asignado_por}
                    </p>
                    {tarea.observaciones && (
                      <p className="text-sm text-[#214a4c]">
                        <strong>Observaciones:</strong> {tarea.observaciones}
                      </p>
                    )}
                    <div className="pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirFichaTecnica(tarea)
                        }}
                        className="rounded-lg border border-[#8ad2d6] bg-[linear-gradient(145deg,#14b6bf_0%,#8ce06f_100%)] px-3 py-1 text-sm font-semibold text-[#083f43] transition hover:brightness-105"
                      >
                        Abrir ticket para finalizar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
