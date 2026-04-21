import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'
import { API_BASE } from '@/lib/api'

interface ReactivacionFormProps {
  onBack: () => void
  onMostrarLogin: () => void
}

export function ReactivacionForm({ onBack, onMostrarLogin }: ReactivacionFormProps) {
  const [cedula, setCedula] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [solicitudEnviada, setSolicitudEnviada] = useState(false)
  const [personaInfo, setPersonaInfo] = useState<any>(null)
  const [paso, setPaso] = useState<'cedula' | 'motivo' | 'estado'>('cedula')
  const [error, setError] = useState<string | null>(null)

  const formatearFecha = (fechaStr: string): string => {
    if (!fechaStr) return ''
    try {
      const fecha = new Date(fechaStr)
      return fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return fechaStr
    }
  }
  const verificarCedula = async () => {
    if (!cedula.trim()) {
      toast.error('Por favor ingresa tu cédula')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const url = `${API_BASE}/verificar-estado-persona/`
      console.log('Verificando cédula en:', url)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identificacion: cedula.trim() }),
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      if (!response.ok) {
        throw new Error(data.error || 'Error al verificar cédula')
      }

      if (!data.existe) {
        setError('Persona no encontrada en el sistema')
        toast.error('Persona no encontrada en el sistema')
        setCedula('')
        return
      }

      setPersonaInfo(data)

      // Si hay solicitud previa, mostrar su estado
      if (data.solicitud_previa) {
        setPaso('estado')
        return
      }

      // Si no puede solicitar, mostrar error
      if (!data.puede_solicitar_reactivacion) {
        setError('No puedes solicitar reactivación. Tu cuenta podría estar activa o no ser contratista.')
        toast.error('No puedes solicitar reactivación. Tu cuenta podría estar activa o no ser contratista.')
        return
      }

      // Si puede solicitar, ir al paso de motivo
      setPaso('motivo')
      toast.success(`¡Hola ${data.nombre}! Ahora cuéntanos el motivo de tu reactivación.`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error al verificar la cédula'
      setError(errorMsg)
      toast.error(errorMsg)
      console.error('Error detallado:', error)
    } finally {
      setLoading(false)
    }
  }

  const enviarSolicitud = async () => {
    if (!motivo.trim()) {
      toast.error('Por favor ingresa el motivo de reactivación')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const url = `${API_BASE}/solicitar-reactivacion-contratista/`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identificacion: cedula.trim(),
          motivo: motivo.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Error al enviar solicitud')
      }

      setSolicitudEnviada(true)
      toast.success('Solicitud enviada. Pronto te contactaremos.')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'No pudimos enviar tu solicitud. Intenta de nuevo.'
      setError(errorMsg)
      toast.error(errorMsg)
      console.error('Error detallado:', error)
    } finally {
      setLoading(false)
    }
  }

  if (solicitudEnviada) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="rounded-lg bg-green-50 p-6">
          <h2 className="mb-2 text-lg font-semibold text-green-700">¡Solicitud Enviada!</h2>
          <p className="mb-4 text-sm text-green-600">
            Tu solicitud de reactivación ha sido registrada. 
            Administración revisará tu caso y te contactaremos pronto.
          </p>
          <button
            onClick={onMostrarLogin}
            className="w-full rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300]"
          >
            Volver al Formulario
          </button>
        </div>
      </div>
    )
  }

  // Mostrar estado de solicitud previa
  if (paso === 'estado' && personaInfo?.solicitud_previa) {
    const solicitud = personaInfo.solicitud_previa

    let estadoConfig = {
      color: 'bg-yellow-50 border-yellow-200',
      textColor: 'text-yellow-700',
      icono: '⏳',
      titulo: 'En Revisión',
      mensaje: 'Tu solicitud está siendo revisada. Nos contactaremos pronto.'
    }

    if (solicitud.estado === 'APROBADA') {
      estadoConfig = {
        color: 'bg-green-50 border-green-200',
        textColor: 'text-green-700',
        icono: '✅',
        titulo: 'Aprobada',
        mensaje: 'Tu cuenta ha sido reactivada correctamente.'
      }
    } else if (solicitud.estado === 'RECHAZADA') {
      estadoConfig = {
        color: 'bg-red-50 border-red-200',
        textColor: 'text-red-700',
        icono: '❌',
        titulo: 'Rechazada',
        mensaje: 'Tu solicitud fue rechazada. Contacta con administración para más información.'
      }
    }

    const haSidoAprobada = solicitud.estado === 'APROBADA' && solicitud.fecha_nueva_vigencia

    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <ArrowLeft className="size-5 text-[#1a4d2e]" />
          </button>
          <h2 className="text-lg font-semibold text-[#1a4d2e]">
            Estado de tu Solicitud
          </h2>
        </div>

        <div className={`rounded-lg border p-6 ${estadoConfig.color}`}>
          <h3 className={`mb-4 text-lg font-semibold ${estadoConfig.textColor}`}>
            {estadoConfig.icono} {estadoConfig.titulo}
          </h3>

          <p className={`mb-4 ${estadoConfig.textColor}`}>
            {estadoConfig.mensaje}
          </p>

          {haSidoAprobada && (
            <div className={`rounded-lg bg-white p-4 border-l-4 border-green-500`}>
              <p className="font-semibold text-green-700">Tu contrato está vigente hasta:</p>
              <p className="mt-2 text-xl font-bold text-green-700">
                {formatearFecha(solicitud.fecha_nueva_vigencia)}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-1 text-xs text-gray-600">
            <p>
              <strong>Estado:</strong> {solicitud.estado}
            </p>
            <p>
              <strong>Fecha de solicitud:</strong> {formatearFecha(solicitud.fecha_solicitud)}
            </p>
            {solicitud.motivo && (
              <p>
                <strong>Motivo:</strong> {solicitud.motivo.substring(0, 50)}...
              </p>
            )}
          </div>
        </div>

        {!haSidoAprobada && (
          <button
            onClick={() => {
              setCedula('')
              setMotivo('')
              setPersonaInfo(null)
              setPaso('cedula')
              setError(null)
            }}
            className="w-full rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300]"
          >
            Volver a Verificar
          </button>
        )}

        {haSidoAprobada && (
          <button
            onClick={onMostrarLogin}
            className="w-full rounded-lg bg-[#2d7a4f] py-2 font-semibold text-white transition hover:bg-[#1a4d2e]"
          >
            Inicia Sesión
          </button>
        )}
      </div>
    )
  }

  // Pantalla de ingreso de cédula
  if (paso === 'cedula') {
    return (
      <form
        className="mx-auto max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          verificarCedula()
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <ArrowLeft className="size-5 text-[#1a4d2e]" />
          </button>
          <h2 className="text-lg font-semibold text-[#1a4d2e]">
            Solicitud de Reactivación
          </h2>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#1a4d2e]">
            Tu Cédula
          </label>
          <p className="text-xs text-gray-600">
            Ingresa tu número de cédula para verificar tu estado
          </p>
          <input
            type="text"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Ej: 1234567890"
            className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300] disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? 'Verificando...' : 'Verificar Cédula'}
        </button>
      </form>
    )
  }

  // Pantalla de ingreso de motivo
  return (
    <form
      className="mx-auto max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        enviarSolicitud()
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPaso('cedula')
            setCedula('')
            setMotivo('')
            setError(null)
          }}
          className="rounded-lg p-2 hover:bg-gray-100"
        >
          <ArrowLeft className="size-5 text-[#1a4d2e]" />
        </button>
        <h2 className="text-lg font-semibold text-[#1a4d2e]">
          Motivo de Reactivación
        </h2>
      </div>

      {personaInfo && (
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-sm text-blue-700">
            <strong>Persona:</strong> {personaInfo.nombre}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#1a4d2e]">
          ¿Cuál es el motivo de tu reactivación?
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: Necesito reactivar mi cuenta para continuar con servicios técnicos..."
          className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
          rows={4}
          disabled={loading}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setPaso('cedula')
            setMotivo('')
            setError(null)
          }}
          disabled={loading}
          className="flex-1 rounded-lg border border-[#81c784] bg-white py-2 font-semibold text-[#1a4d2e] transition hover:bg-gray-50 disabled:opacity-50"
        >
          Atrás
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300] disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? 'Enviando...' : 'Enviar Solicitud'}
        </button>
      </div>
    </form>
  )
}
