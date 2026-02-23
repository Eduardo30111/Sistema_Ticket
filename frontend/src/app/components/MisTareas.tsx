import { useState, useEffect } from 'react'
import { obtenerMisTareas, actualizarTarea } from '@/lib/tareas'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { toast } from 'sonner'
import { Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react'

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
  observaciones: string
  equipo_tipo: string
  equipo_serie: string
  descripcion: string
}

interface MisTareasProps {
  usuarioId: number
}

export function MisTareas({ usuarioId }: MisTareasProps) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    cargarTareas()
  }, [usuarioId])

  const cargarTareas = async () => {
    setLoading(true)
    try {
      const data = await obtenerMisTareas(usuarioId)
      setTareas(Array.isArray(data) ? data : [])
    } catch (error) {
      toast.error('Error al cargar las tareas')
      console.error(error)
      setTareas([])
    } finally {
      setLoading(false)
    }
  }

  const cambiarEstado = async (tareaId: number, nuevoEstado: string) => {
    setUpdatingId(tareaId)
    try {
      await actualizarTarea(tareaId, { estado: nuevoEstado })
      toast.success('Tarea actualizada correctamente')
      await cargarTareas()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la tarea')
    } finally {
      setUpdatingId(null)
    }
  }

  const tareasPendientes = tareas.filter((t) => t.estado === 'PENDIENTE')
  const tareasEnProceso = tareas.filter((t) => t.estado === 'EN_PROCESO')
  const tareasFinalizadas = tareas.filter((t) => t.estado === 'FINALIZADA')

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
        return 'border-yellow-300 bg-yellow-50'
      case 'EN_PROCESO':
        return 'border-blue-300 bg-blue-50'
      case 'FINALIZADA':
        return 'border-green-300 bg-green-50'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-[#1a4d2e]">Mis Tareas Asignadas</h2>

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pendientes">
            Pendientes ({tareasPendientes.length})
          </TabsTrigger>
          <TabsTrigger value="en-proceso">
            En Proceso ({tareasEnProceso.length})
          </TabsTrigger>
          <TabsTrigger value="finalizadas">
            Finalizadas ({tareasFinalizadas.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4">
          {tareasPendientes.length === 0 ? (
            <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-6 text-center">
              <p className="text-yellow-700">No hay tareas pendientes</p>
            </div>
          ) : (
            tareasPendientes.map((tarea) => (
              <div
                key={tarea.id}
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${getEstadoColor(tarea.estado)}`}
                onClick={() => setExpandedId(expandedId === tarea.id ? null : tarea.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(tarea.estado)}
                      <h3 className="text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{tarea.ticket_id}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      Equipo: {tarea.equipo_tipo} - {tarea.equipo_serie}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cambiarEstado(tarea.id, 'EN_PROCESO')
                    }}
                    disabled={updatingId === tarea.id}
                    className="rounded-lg bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600 disabled:opacity-50"
                  >
                    {updatingId === tarea.id ? 'Actualizando...' : 'Comenzar'}
                  </button>
                </div>

                {expandedId === tarea.id && (
                  <div className="mt-4 space-y-2 border-t border-current pt-3">
                    <p className="text-sm text-gray-700">
                      <strong>Descripción:</strong> {tarea.descripcion}
                    </p>
                    <p className="text-xs text-gray-600">
                      Asignado por: {tarea.asignado_por}
                    </p>
                    {tarea.observaciones && (
                      <p className="text-sm text-gray-700">
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
            <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-6 text-center">
              <p className="text-blue-700">No hay tareas en proceso</p>
            </div>
          ) : (
            tareasEnProceso.map((tarea) => (
              <div
                key={tarea.id}
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${getEstadoColor(tarea.estado)}`}
                onClick={() => setExpandedId(expandedId === tarea.id ? null : tarea.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(tarea.estado)}
                      <h3 className="text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{tarea.ticket_id}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      Equipo: {tarea.equipo_tipo} - {tarea.equipo_serie}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cambiarEstado(tarea.id, 'FINALIZADA')
                    }}
                    disabled={updatingId === tarea.id}
                    className="rounded-lg bg-green-500 px-3 py-1 text-sm text-white transition hover:bg-green-600 disabled:opacity-50"
                  >
                    {updatingId === tarea.id ? 'Finalizando...' : 'Finalizar'}
                  </button>
                </div>

                {expandedId === tarea.id && (
                  <div className="mt-4 space-y-2 border-t border-current pt-3">
                    <p className="text-sm text-gray-700">
                      <strong>Descripción:</strong> {tarea.descripcion}
                    </p>
                    <p className="text-xs text-gray-600">
                      Asignado por: {tarea.asignado_por}
                    </p>
                    {tarea.observaciones && (
                      <p className="text-sm text-gray-700">
                        <strong>Observaciones:</strong> {tarea.observaciones}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="finalizadas" className="space-y-4">
          {tareasFinalizadas.length === 0 ? (
            <div className="rounded-lg border-2 border-green-300 bg-green-50 p-6 text-center">
              <p className="text-green-700">No hay tareas finalizadas</p>
            </div>
          ) : (
            tareasFinalizadas.map((tarea) => (
              <div
                key={tarea.id}
                className={`cursor-pointer rounded-lg border-2 p-4 transition ${getEstadoColor(tarea.estado)}`}
                onClick={() => setExpandedId(expandedId === tarea.id ? null : tarea.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(tarea.estado)}
                      <h3 className="text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{tarea.ticket_id}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      Equipo: {tarea.equipo_tipo} - {tarea.equipo_serie}
                    </p>
                  </div>
                </div>

                {expandedId === tarea.id && (
                  <div className="mt-4 space-y-2 border-t border-current pt-3">
                    <p className="text-sm text-gray-700">
                      <strong>Descripción:</strong> {tarea.descripcion}
                    </p>
                    <p className="text-xs text-gray-600">
                      Asignado por: {tarea.asignado_por}
                    </p>
                    {tarea.observaciones && (
                      <p className="text-sm text-gray-700">
                        <strong>Observaciones:</strong> {tarea.observaciones}
                      </p>
                    )}
                    {tarea.fecha_finalizacion && (
                      <p className="text-xs text-gray-600">
                        Finalizado: {new Date(tarea.fecha_finalizacion).toLocaleString()}
                      </p>
                    )}
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
