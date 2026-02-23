import { useState, useEffect } from 'react'
import type { Ticket } from '@/lib/api'
import { getTickets, completeTicket, downloadTicketPdf, getStatistics, clearAuth } from '@/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { MisTareas } from './MisTareas'
import { NotificationBar } from './NotificationBar'
import { toast } from 'sonner'
import { Loader2, Download, CheckCircle, LogOut } from 'lucide-react'

interface TechnicianDashboardProps {
  onLogout: () => void
}

export function TechnicianDashboard({ onLogout }: TechnicianDashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [completingTicket, setCompletingTicket] = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [procedureDescription, setProcedureDescription] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const { tickets: data } = await getTickets()
      setTickets(data)
      const statsData = await getStatistics()
      setStats(statsData)
    } catch (error) {
      toast.error('Error al cargar datos')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteTicket = async (ticket: Ticket) => {
    if (!procedureDescription.trim()) {
      toast.error('Por favor describe el procedimiento realizado')
      return
    }

    setCompletingTicket(ticket.id)
    try {
      await completeTicket(ticket.id, {
        technicianName: 'Técnico del Sistema',
        procedureDescription,
      })
      toast.success('Ticket completado exitosamente')
      setProcedureDescription('')
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
    } catch (error) {
      toast.error('Error al descargar PDF')
    }
  }

  const handleLogout = () => {
    clearAuth()
    onLogout()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
      </div>
    )
  }

  const pendingTickets = tickets.filter(t => !['CERRADO', 'COMPLETADO'].includes(t.status))
  const completedTickets = tickets.filter(t => ['CERRADO', 'COMPLETADO'].includes(t.status))

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff9c4] via-white to-[#fff3e0]">
      <NotificationBar />
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#1a4d2e]">Área de Técnicos</h1>
            <p className="text-[#2d7a4f]">Gestiona y resuelve tickets de soporte</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white transition hover:bg-red-600"
          >
            <LogOut className="size-4" />
            Cerrar Sesión
          </button>
        </div>

        {stats && (
          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border-2 border-[#ffd54f] bg-[#fffde7] p-4">
              <p className="text-sm text-[#1a4d2e]">Pendientes</p>
              <p className="text-2xl font-bold text-[#fbc02d]">{stats.pending || 0}</p>
            </div>
            <div className="rounded-lg border-2 border-[#ff9800] bg-[#fff3e0] p-4">
              <p className="text-sm text-[#1a4d2e]">En Proceso</p>
              <p className="text-2xl font-bold text-[#ff9800]">{stats.in_process || 0}</p>
            </div>
            <div className="rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-4">
              <p className="text-sm text-[#1a4d2e]">Cerrados</p>
              <p className="text-2xl font-bold text-[#2d7a4f]">{stats.closed || 0}</p>
            </div>
            <div className="rounded-lg border-2 border-[#64b5f6] bg-[#e3f2fd] p-4">
              <p className="text-sm text-[#1a4d2e]">Total</p>
              <p className="text-2xl font-bold text-[#1976d2]">{stats.total || 0}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">
              Pendientes ({pendingTickets.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completados ({completedTickets.length})
            </TabsTrigger>
            <TabsTrigger value="mis-tareas">
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
                <div
                  key={ticket.id}
                  className="rounded-lg border-2 border-[#ffd54f] bg-white p-4"
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

                  <p className="mb-4 text-sm text-gray-600">{ticket.description}</p>

                  {selectedTicket?.id === ticket.id ? (
                    <div className="space-y-3 rounded-lg bg-[#f5f5f5] p-3">
                      <textarea
                        value={procedureDescription}
                        onChange={(e) => setProcedureDescription(e.target.value)}
                        placeholder="Describe el procedimiento realizado..."
                        className="w-full rounded-lg border border-[#81c784] bg-white px-3 py-2"
                        rows={3}
                      />
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
                          }}
                          className="rounded-lg bg-gray-400 px-3 py-2 text-white hover:bg-gray-500"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="w-full rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300]"
                    >
                      Resolver
                    </button>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedTickets.length === 0 ? (
              <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-8 text-center">
                <p className="text-gray-600">No hay tickets completados aún</p>
              </div>
            ) : (
              completedTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1a4d2e]">
                        Ticket #{ticket.id}
                      </h3>
                      <p className="text-sm text-[#2d7a4f]">
                        {ticket.personName} ({ticket.personId})
                      </p>
                      <p className="mt-2 text-xs text-gray-600">
                        Atendido por: {ticket.atendido_por || 'N/A'}
                      </p>
                      {ticket.procedimiento && (
                        <p className="mt-1 text-xs text-gray-600">
                          Procedimiento: {ticket.procedimiento}
                        </p>
                      )}
                    </div>
                    <CheckCircle className="size-6 text-[#2d7a4f]" />
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="mis-tareas" className="space-y-4">
            <MisTareas usuarioId={1} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
