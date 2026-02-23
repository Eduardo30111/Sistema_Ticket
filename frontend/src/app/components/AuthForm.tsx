import { useState } from 'react'
import { login } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface AuthFormProps {
  onSuccess: () => void
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim() || !password.trim()) {
      toast.error('Por favor completa todos los campos')
      return
    }

    setLoading(true)
    try {
      await login(email, password)
      toast.success('Sesión iniciada correctamente')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#1a4d2e]">
          Usuario o Email
        </label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ejemplo@correo.com o usuario"
          className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#1a4d2e]">
          Contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tu contraseña"
          className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#ffd54f] py-2 font-semibold text-[#1a4d2e] transition hover:bg-[#ffb300] disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Iniciando sesión...
          </span>
        ) : (
          'Iniciar Sesión'
        )}
      </button>
    </form>
  )
}
