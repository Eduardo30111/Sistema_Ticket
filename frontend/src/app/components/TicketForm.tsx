import { useState } from 'react'
import { createTicket } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, CheckCircle } from 'lucide-react'

export function TicketForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    personName: '',
    personId: '',
    equipmentType: '',
    damageType: '',
    description: '',
    email: '',
    phone: '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.personName.trim() ||
      !formData.personId.trim() ||
      !formData.equipmentType.trim() ||
      !formData.damageType.trim() ||
      !formData.description.trim()
    ) {
      toast.error('Por favor completa todos los campos obligatorios')
      return
    }

    setLoading(true)
    try {
      const result = await createTicket(formData)
      toast.success(`Ticket creado exitosamente. ID: ${result.ticketId}`)
      setSuccess(true)
      setFormData({
        personName: '',
        personId: '',
        equipmentType: '',
        damageType: '',
        description: '',
        email: '',
        phone: '',
      })
      setTimeout(() => setSuccess(false), 3000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el ticket')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-lg border-2 border-[#81c784] bg-[#e8f5e9] p-6 text-center">
        <CheckCircle className="mx-auto mb-4 size-12 text-[#2d7a4f]" />
        <h3 className="mb-2 text-lg font-semibold text-[#1a4d2e]">
          ¡Ticket creado exitosamente!
        </h3>
        <p className="text-sm text-[#2d7a4f]">
          Recibirás notificación cuando nuestro equipo comience con tu solicitud.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border-2 border-[#81c784] bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Nombre Completo *
          </label>
          <input
            type="text"
            name="personName"
            value={formData.personName}
            onChange={handleChange}
            placeholder="Juan Pérez"
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Identificación *
          </label>
          <input
            type="text"
            name="personId"
            value={formData.personId}
            onChange={handleChange}
            placeholder="1234567890"
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Tipo de Equipo *
          </label>
          <select
            name="equipmentType"
            value={formData.equipmentType}
            onChange={handleChange}
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          >
            <option value="">Selecciona un tipo</option>
            <option value="Computadora">Computadora</option>
            <option value="Laptop">Laptop</option>
            <option value="Impresora">Impresora</option>
            <option value="Monitor">Monitor</option>
            <option value="Red">Equipo de Red</option>
            <option value="Servidor">Servidor</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Tipo de Daño *
          </label>
          <select
            name="damageType"
            value={formData.damageType}
            onChange={handleChange}
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          >
            <option value="">Selecciona un tipo de daño</option>
            <option value="Hardware">Daño de Hardware</option>
            <option value="Software">Problema de Software</option>
            <option value="Red">Problema de Red</option>
            <option value="Rendimiento">Bajo Rendimiento</option>
            <option value="Virus">Virus/Malware</option>
            <option value="Acceso">Problemas de Acceso</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Email (Opcional)
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="ejemplo@correo.com"
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Teléfono (Opcional)
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="+1 (555) 123-4567"
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[#1a4d2e]">
          Descripción del Problema *
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Describe en detalle el problema que estás experimentando..."
          rows={4}
          className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#81c784] py-2 font-semibold text-white transition hover:bg-[#66bb6a] disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Creando ticket...
          </span>
        ) : (
          'Solicitar Servicio'
        )}
      </button>
    </form>
  )
}
