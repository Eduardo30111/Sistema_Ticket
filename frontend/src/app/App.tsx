import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { TicketForm } from '@/app/components/TicketForm'
import { AuthForm } from '@/app/components/AuthForm'
import { ReactivacionForm } from '@/app/components/ReactivacionForm'
import { TechnicianDashboard } from '@/app/components/TechnicianDashboard'
import { InventoryDeliveryModule } from '@/app/components/InventoryDeliveryModule'
import { getModuleAccess, isAuthenticated, sendMascotaFeedback } from '@/lib/api'
import { Toaster } from 'sonner'
import { ClipboardList, Lock } from 'lucide-react'
import robotMascot from '@/assets/RobotTIC.png'

type ModuleKey = 'support' | 'inventory'

export default function App() {
  const [auth, setAuth] = useState(() => isAuthenticated())
  const [activeModule, setActiveModule] = useState<ModuleKey>('support')
  const [showLoader, setShowLoader] = useState(true)
  const [showMascotaForm, setShowMascotaForm] = useState(false)
  const [sendingMascotaForm, setSendingMascotaForm] = useState(false)
  const [mostrarReactivacion, setMostrarReactivacion] = useState(false)
  const [moduleAccess, setModuleAccess] = useState(() => getModuleAccess())
  const [mascotaData, setMascotaData] = useState({
    nombre: '',
    oficina: '',
    mejora: '',
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowLoader(false), 1400)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (activeModule !== 'support') {
      setShowMascotaForm(false)
    }
  }, [activeModule])

  useEffect(() => {
    if (!auth && activeModule !== 'support') {
      setActiveModule('support')
    }
  }, [auth, activeModule])

  useEffect(() => {
    const modules = getModuleAccess()
    setModuleAccess(modules)
    if (auth && !modules.support && modules.inventory) {
      setActiveModule('inventory')
      return
    }
    if (auth && activeModule === 'inventory' && !modules.inventory) {
      setActiveModule('support')
    }
  }, [auth, activeModule])

  const handleMascotaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setMascotaData((prev) => ({ ...prev, [name]: value }))
  }

  const handleMascotaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!mascotaData.nombre.trim() || !mascotaData.oficina.trim() || !mascotaData.mejora.trim()) {
      return
    }

    setSendingMascotaForm(true)
    try {
      await sendMascotaFeedback({
        nombre: mascotaData.nombre.trim(),
        oficina: mascotaData.oficina.trim(),
        mejora: mascotaData.mejora.trim(),
      })
      setMascotaData({ nombre: '', oficina: '', mejora: '' })
      setShowMascotaForm(false)
    } finally {
      setSendingMascotaForm(false)
    }
  }

  const renderSupportModule = () => (
    auth ? (
      <TechnicianDashboard onLogout={() => setAuth(false)} />
    ) : (
      <div className="container mx-auto min-w-0 max-w-full px-4 py-6 md:py-8">
        <div className="relative mb-10 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
          <div className="absolute left-0 top-0 h-full w-1 bg-green-700" aria-hidden />

          <div className="relative grid items-center gap-10 px-6 py-10 md:grid-cols-2 md:px-10 md:py-12">
            <div className="animate-fade-in-up">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Oficina TIC</p>
              <h1 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 md:text-4xl">
                Sistema de tickets de soporte
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-zinc-600 md:text-lg">
                Registro, asignación y cierre de incidencias con trazabilidad clara para el equipo y quien solicita ayuda.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-800">
                  Registro centralizado
                </p>
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-800">
                  Seguimiento en vivo
                </p>
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-800">
                  Cierre con evidencia
                </p>
              </div>

              <div className="mt-8 flex items-center gap-2 text-xs font-medium text-zinc-500">
                <span className="inline-block size-2 rounded-full bg-green-600" aria-hidden />
                Asistente Robot TIC disponible
              </div>
            </div>

            <div className="group relative mx-auto w-full max-w-xs md:max-w-sm" tabIndex={0}>
              <div className="pointer-events-none absolute -top-2 left-1/2 z-20 w-72 -translate-x-1/2 -translate-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-sm leading-snug text-zinc-700 opacity-0 shadow-lg transition-all duration-300 group-hover:-translate-y-4 group-hover:opacity-100 group-focus-within:-translate-y-4 group-focus-within:opacity-100">
                Mascota TIC: envíanos sugerencias para mejorar el servicio.
              </div>
              <button
                type="button"
                onClick={() => setShowMascotaForm(true)}
                className="relative z-10 mx-auto block w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:shadow-md"
              >
                <img
                  src={robotMascot}
                  alt="Robot TIC"
                  className="robot-clean loader-robot mx-auto h-56 w-56 object-contain md:h-64 md:w-64"
                />
                <p className="mt-3 text-center text-xs font-medium text-zinc-600">Sugerencias y mejoras</p>
              </button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="public" className="mx-auto max-w-5xl">
          <TabsList className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1">
            <TabsTrigger
              value="public"
              className="gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-green-800 data-[state=active]:shadow-sm sm:gap-2"
            >
              <ClipboardList className="size-4 shrink-0" />
              <span className="min-w-0">Solicitar servicio</span>
            </TabsTrigger>
            <TabsTrigger
              value="technician"
              className="gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-green-800 data-[state=active]:shadow-sm sm:gap-2"
            >
              <Lock className="size-4 shrink-0" />
              <span className="min-w-0">Portal técnico</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="mt-6">
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-zinc-900">Formulario público</h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  Solicita asistencia técnica; recibirás confirmación y el equipo atenderá tu ticket.
                </p>
              </div>
              <TicketForm />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">o</span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-5 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-amber-950">Reactivación de cuenta</h3>
                <p className="text-sm leading-relaxed text-amber-900/80">
                  Si tu cuenta quedó inactiva por vigencia de contrato, solicita reactivación aquí.
                </p>
              </div>
              {mostrarReactivacion ? (
                <ReactivacionForm
                  onBack={() => setMostrarReactivacion(false)}
                  onMostrarLogin={() => setMostrarReactivacion(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarReactivacion(true)}
                  className="mx-auto block w-full max-w-md rounded-lg border border-amber-300 bg-white py-2.5 text-center text-sm font-medium text-amber-950 transition hover:bg-amber-50"
                >
                  Ir a solicitud de reactivación
                </button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="technician" className="mt-6">
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-zinc-900">Portal técnico</h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  Solo personal autorizado. Inicia sesión para gestionar tickets y tareas.
                </p>
              </div>
              <AuthForm
                onSuccess={() => setAuth(true)}
                onSolicitarReactivacion={() => {
                  setMostrarReactivacion(true)
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-12 min-w-0 rounded-xl border border-zinc-200 bg-white p-5 text-center shadow-sm sm:p-6">
          <p className="text-sm leading-relaxed text-zinc-600 [overflow-wrap:anywhere] md:text-base">
            Proyecto desarrollado en prácticas de Ingeniería de Sistemas (Universidad de Salamanca).
          </p>
          <p className="mt-4 text-sm font-semibold text-zinc-900 [overflow-wrap:anywhere] md:text-base">
            Eduardo Andrés Sánchez Sierra
          </p>
          <p className="mt-1 text-sm text-zinc-600">Teléfono: +57 320 771 6590</p>
          <p className="mt-1 break-all text-sm text-zinc-600 sm:break-words">
            Correo:{' '}
            <a className="text-green-800 underline-offset-2 hover:underline" href="mailto:sanchezsierraeduardoandres@gmail.com">
              sanchezsierraeduardoandres@gmail.com
            </a>
          </p>
        </div>
      </div>
    )
  )

  if (showLoader) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-2xl border border-zinc-200 bg-white px-8 py-10 text-center shadow-lg">
          <div className="loader-orb-ring mb-6 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <img
              src={robotMascot}
              alt="Mascota TIC"
              className="loader-robot robot-clean h-36 w-36 object-contain md:h-44 md:w-44"
            />
          </div>

          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Oficina TIC</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">Cargando aplicación</h1>
          <p className="mt-2 text-sm text-zinc-600">Preparando el centro de soporte…</p>
          <div className="mt-8 h-1.5 w-52 overflow-hidden rounded-full bg-zinc-200">
            <div className="loader-progress h-full w-1/2 rounded-full bg-green-700" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50">
      <Toaster position="top-right" richColors toastOptions={{ classNames: { toast: 'border border-zinc-200 shadow-md' } }} />

      {showMascotaForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Ayúdanos a mejorar</h3>
            <p className="mt-1 text-sm text-zinc-600">Tu sugerencia llega al equipo TIC.</p>

            <form onSubmit={handleMascotaSubmit} className="mt-4 space-y-3">
              <input
                name="nombre"
                value={mascotaData.nombre}
                onChange={handleMascotaChange}
                placeholder="Nombre"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-green-700 focus:ring-1 focus:ring-green-700"
                disabled={sendingMascotaForm}
              />
              <input
                name="oficina"
                value={mascotaData.oficina}
                onChange={handleMascotaChange}
                placeholder="Oficina"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-green-700 focus:ring-1 focus:ring-green-700"
                disabled={sendingMascotaForm}
              />
              <textarea
                name="mejora"
                value={mascotaData.mejora}
                onChange={handleMascotaChange}
                placeholder="¿Qué podemos mejorar?"
                rows={4}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-green-700 focus:ring-1 focus:ring-green-700"
                disabled={sendingMascotaForm}
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMascotaForm(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                  disabled={sendingMascotaForm}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={sendingMascotaForm}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800 disabled:opacity-50"
                >
                  {sendingMascotaForm ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="container mx-auto min-w-0 max-w-full px-4 py-6 md:py-8">
        {auth && (
          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Módulos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {moduleAccess.support && (
                <button
                  type="button"
                  onClick={() => setActiveModule('support')}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    activeModule === 'support'
                      ? 'border-green-800 bg-green-800 text-white shadow-sm'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white'
                  }`}
                >
                  Servicio técnico
                </button>
              )}
              {moduleAccess.inventory && (
                <button
                  type="button"
                  onClick={() => setActiveModule('inventory')}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    activeModule === 'inventory'
                      ? 'border-green-800 bg-green-800 text-white shadow-sm'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white'
                  }`}
                >
                  Inventario
                </button>
              )}
            </div>
          </section>
        )}

        <div className="mt-8">
          {activeModule === 'support' && renderSupportModule()}
          {auth && activeModule === 'inventory' && (
            <InventoryDeliveryModule />
          )}
        </div>
      </div>
    </div>
  )
}
