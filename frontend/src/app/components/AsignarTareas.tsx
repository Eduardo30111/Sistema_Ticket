import { useState } from 'react'
import { crearTarea } from '@/lib/tareas'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'

interface Usuario {
  id: number
  nombre: string
  correo: string
  telefono: string
  activo: boolean
}

interface Ticket {
  id: number
  usuario: {
    nombre: string
    identificacion: string
  }
  equipo: {
    tipo: string
    serie: string
  }
  descripcion: string
  estado: string
}

interface AsignarTareasProps {
  tickets: Ticket[]
  usuarios: Usuario[]
  onTaskCreated?: () => void
}

export function AsignarTareas({ tickets, usuarios, onTaskCreated }: AsignarTareasProps) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    ticket: '',
    usuario_asignado: '',
    asignado_por: 'Admin',
    observaciones: '',
  })

  const usuariosActivos = usuarios.filter((u) => u.activo)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.ticket || !formData.usuario_asignado) {
      toast.error('Por favor completa todos los campos obligatorios')
      return
    }

    setLoading(true)
    try {
      await crearTarea({
        ticket: parseInt(formData.ticket),
        usuario_asignado: parseInt(formData.usuario_asignado),
        asignado_por: formData.asignado_por || 'Admin',
        observaciones: formData.observaciones,
      })
      toast.success('Tarea asignada correctamente')
      setFormData({
        ticket: '',
        usuario_asignado: '',
        asignado_por: 'Admin',
        observaciones: '',
      })
      setShowForm(false)
      onTaskCreated?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al asignar la tarea')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border-2 border-[#ffd54f] bg-[#fffde7] p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1a4d2e]">Asignar Tareas</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-[#ffd54f] px-4 py-2 text-[#1a4d2e] transition hover:bg-[#ffb300]"
        >
          <Plus className="size-4" />
          Nueva Tarea
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">
                Seleccionar Ticket *
              </label>
              <select
                name="ticket"
                value={formData.ticket}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
              >
                <option value="">-- Selecciona un ticket --</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    Ticket #{t.id} - {t.equipo.tipo} ({t.estado})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">
                Asignar a Usuario *
              </label>
              <select
                name="usuario_asignado"
                value={formData.usuario_asignado}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
              >
                <option value="">-- Selecciona un usuario --</option>
                {usuariosActivos.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.correo})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">
                Asignado por
              </label>
              <input
                type="text"
                name="asignado_por"
                value={formData.asignado_por}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#1a4d2e]">
              Observaciones (Opcional)
            </label>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              placeholder="Agrega notas o instrucciones especiales..."
              rows={3}
              className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-[#81c784] py-2 font-semibold text-white transition hover:bg-[#66bb6a] disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Asignando...
                </span>
              ) : (
                'Asignar Tarea'
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg bg-gray-400 px-4 py-2 text-white transition hover:bg-gray-500"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
