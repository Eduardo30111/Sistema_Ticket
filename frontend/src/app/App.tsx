import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { TicketForm } from '@/app/components/TicketForm'
import { AuthForm } from '@/app/components/AuthForm'
import { ReactivacionForm } from '@/app/components/ReactivacionForm'
import { TechnicianDashboard } from '@/app/components/TechnicianDashboard'
import { InventoryDeliveryModule } from '@/app/components/InventoryDeliveryModule'
import { isAuthenticated, sendMascotaFeedback } from '@/lib/api'
import { Toaster } from 'sonner'
import { ClipboardList, Lock, Sparkles } from 'lucide-react'
import robotMascot from '@/assets/RobotTIC.png'

type ModuleKey = 'support' | 'inventory'

export default function App() {
  const [auth, setAuth] = useState(() => isAuthenticated())
  const [activeModule, setActiveModule] = useState<ModuleKey>('support')
  const [showLoader, setShowLoader] = useState(true)
  const [showMascotaForm, setShowMascotaForm] = useState(false)
  const [sendingMascotaForm, setSendingMascotaForm] = useState(false)
  const [mostrarReactivacion, setMostrarReactivacion] = useState(false)
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
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="relative mb-8 overflow-hidden rounded-4xl border border-[#8ed89f] bg-white shadow-[0_24px_72px_rgba(13,96,47,0.16)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(13,96,47,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(13,96,47,0.05)_1px,transparent_1px)] bg-size-[34px_34px]" />
          <div className="pointer-events-none absolute -left-20 top-4 h-64 w-64 rounded-full bg-[#42d860]/28 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-2 h-64 w-64 rounded-full bg-[#ffd94d]/28 blur-3xl" />

          <div className="relative grid items-center gap-8 bg-[linear-gradient(126deg,#ecffef_0%,#fafff7_42%,#efffe6_72%,#fffde8_100%)] px-6 py-8 md:grid-cols-2 md:px-10 md:py-10">
            <div className="animate-[fadeInUp_0.5s_ease-out]">
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#95ddaa] bg-[#dbffe5] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#0f7f43]">
                <Sparkles className="size-3" />
                Oficina TIC
              </p>
              <h1 className="mb-3 text-4xl font-extrabold leading-tight text-[#0f5f34] md:text-5xl">
                Sistema de Tickets de Soporte
              </h1>
              <p className="max-w-xl text-base text-[#247b49] md:text-lg">
                Un centro digital para registrar, asignar y cerrar incidencias con velocidad, trazabilidad y una experiencia clara para todo el equipo.
              </p>

              <div className="mt-5 grid gap-2 text-sm text-[#165f38] sm:grid-cols-3">
                <p className="rounded-xl border border-[#9fe0af] bg-[#f2fff4] px-3 py-2 font-semibold shadow-[0_8px_22px_rgba(13,96,47,0.08)]">Registro centralizado</p>
                <p className="rounded-xl border border-[#9fe0af] bg-[#ebfff0] px-3 py-2 font-semibold shadow-[0_8px_22px_rgba(13,96,47,0.08)]">Seguimiento en tiempo real</p>
                <p className="rounded-xl border border-[#e6d98b] bg-[#fffbe9] px-3 py-2 font-semibold shadow-[0_8px_22px_rgba(86,76,10,0.08)]">Cierre con evidencia</p>
              </div>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#9fdea8] bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0f7f43]">
                Robot TIC activo
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#14c768]" />
              </div>
            </div>

            <div className="group relative mx-auto w-full max-w-xs animate-[fadeInUp_0.7s_ease-out] md:max-w-sm" tabIndex={0}>
              <div className="absolute inset-0 rounded-4xl bg-[#61ff7c]/28 blur-3xl" />
              <div className="pointer-events-none absolute -top-2 left-1/2 z-20 w-72 -translate-x-1/2 -translate-y-2 rounded-2xl border border-[#92e4a3] bg-white/95 px-4 py-3 text-center text-sm font-semibold text-[#126237] opacity-0 shadow-[0_14px_30px_rgba(17,86,45,0.22)] transition-all duration-300 group-hover:-translate-y-6 group-hover:opacity-100 group-focus-within:-translate-y-6 group-focus-within:opacity-100 group-focus:-translate-y-6 group-focus:opacity-100">
                Soy la mascota de las TIC, tu asistente digital listo para ayudarte en lo que necesites. Tocame para decirme en que puedo mejorar.
              </div>
              <button
                type="button"
                onClick={() => setShowMascotaForm(true)}
                className="relative z-10 mx-auto block w-full rounded-4xl border border-[#9be2ac] bg-white/90 p-4 shadow-[0_22px_46px_rgba(16,128,61,0.2)] transition-transform duration-300 hover:scale-[1.03]"
              >
                <img
                  src={robotMascot}
                  alt="Robot TIC"
                  className="robot-clean mx-auto h-64 w-64 object-contain md:h-72 md:w-72"
                />
                <p className="mt-2 text-center text-xs font-extrabold uppercase tracking-[0.2em] text-[#0f7f43]">Tocar para sugerencias</p>
              </button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="public" className="mx-auto max-w-5xl">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl border border-[#9ee8ab] bg-[#f3fff5] p-1.5 shadow-[0_12px_28px_rgba(22,111,57,0.1)]">
            <TabsTrigger
              value="public"
              className="gap-2 rounded-xl data-[state=active]:bg-[#0f9d4b] data-[state=active]:text-white"
            >
              <ClipboardList className="size-4" />
              Solicitar Servicio
            </TabsTrigger>
            <TabsTrigger
              value="technician"
              className="gap-2 rounded-xl data-[state=active]:bg-[#7ef55f] data-[state=active]:text-[#0e4d2a]"
            >
              <Lock className="size-4" />
              Portal Técnico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="mt-6">
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#8ee39f] bg-[linear-gradient(120deg,#eefff1_0%,#f6ffef_40%,#fffce9_100%)] p-5 shadow-[0_12px_28px_rgba(12,109,45,0.1)]">
                <h3 className="mb-2 text-lg font-semibold text-[#1a4d2e]">
                  Formulario Público de Solicitud
                </h3>
                <p className="text-sm leading-relaxed text-[#2d7a4f]">
                  Complete el formulario para solicitar asistencia técnica. Recibirá confirmación y su ticket será atendido por nuestro equipo.
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

              <div className="rounded-2xl border border-[#ffc67d] bg-[linear-gradient(120deg,#fffdee_0%,#fffdf4_100%)] p-5 shadow-[0_12px_28px_rgba(200,120,0,0.08)]">
                <h3 className="mb-2 text-lg font-semibold text-[#b8860b]">
                  Solicitar Reactivación
                </h3>
                <p className="text-sm leading-relaxed text-[#8b6914]">
                  Si tu cuenta ha sido desactivada por término de vigencia, puedes solicitar reactivación aquí.
                </p>
              </div>
              {mostrarReactivacion ? (
                <ReactivacionForm
                  onBack={() => setMostrarReactivacion(false)}
                  onMostrarLogin={() => setMostrarReactivacion(false)}
                />
              ) : (
                <button
                  onClick={() => setMostrarReactivacion(true)}
                  className="w-full rounded-lg border-2 border-[#b8860b] bg-white py-2 font-semibold text-[#b8860b] transition hover:bg-yellow-50 md:max-w-md"
                >
                  Ir a Solicitud de Reactivación
                </button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="technician" className="mt-6">
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#c4edce] bg-[linear-gradient(120deg,#f7fff9_0%,#f9ffef_100%)] p-4 shadow-[0_10px_24px_rgba(17,86,45,0.08)]">
                <h3 className="mb-2 font-semibold text-[#1a4d2e]">
                  Acceso Restringido – Personal Técnico
                </h3>
                <p className="text-sm text-[#1a4d2e]">
                  Esta sección es exclusiva para el personal técnico autorizado. Inicie sesión para acceder al panel de control y gestionar tickets.
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

        <div className="mt-12 rounded-3xl border border-[#c6f3d0] bg-[linear-gradient(140deg,#ffffff_0%,#f8fff4_100%)] p-6 text-center shadow-[0_16px_40px_rgba(17,86,45,0.1)]">
          <p className="text-base font-semibold text-[#1a4d2e] md:text-lg">
            Este proyecto fue llevado a cabo por un pasante de la Universidad de Salamanca, quien durante sus prácticas de Ingeniería de Sistemas contribuyó significativamente a su desarrollo.
          </p>
          <p className="mt-3 text-sm font-semibold text-[#2d7a4f] md:text-base">
            Eduardo Andres Sanchez Sierra
          </p>
          <p className="mt-1 text-sm text-[#1a4d2e]">
            Teléfono: +57 320 771 6590
          </p>
          <p className="mt-1 text-sm text-[#1a4d2e]">
            Correo: sanchezsierraeduardoandres@gmail.com
          </p>
        </div>
      </div>
    )
  )

  if (showLoader) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_18%_12%,#e6ffe6_0%,#f1fff4_38%,#f8ffef_65%,#ffffff_100%)] px-6">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,104,56,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,104,56,0.06)_1px,transparent_1px)] bg-size-[28px_28px] opacity-35" />
        <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#4cd964]/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-4 h-72 w-72 rounded-full bg-[#ffe066]/30 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center rounded-4xl border border-[#8ed89f] bg-white/86 px-6 py-9 text-center shadow-[0_28px_80px_rgba(20,120,55,0.18)] backdrop-blur-md md:px-10">
          <div className="loader-orb-ring mb-5 rounded-[1.4rem] bg-white p-3 shadow-[0_0_35px_rgba(16,185,80,0.3)]">
            <img
              src={robotMascot}
              alt="Mascota TIC"
              className="loader-robot robot-clean h-40 w-40 object-contain md:h-52 md:w-52"
            />
          </div>

          <p className="loader-shimmer text-xs font-bold uppercase tracking-[0.3em] text-[#118243]">
            Oficina TIC
          </p>
          <p className="loader-welcome mt-2 text-lg font-extrabold uppercase tracking-[0.14em] text-[#0f7f43] md:text-xl">
            Bienvenidos
          </p>
          <h1 className="mt-3 text-3xl font-black text-[#0d5a2f] md:text-4xl">
            Cargando Centro de Soporte
          </h1>
          <p className="mt-2 text-sm text-[#247b49] md:text-base">
            Preparando panel y servicios para que puedas gestionar tickets sin fricciones.
          </p>
          <div className="mt-6 h-2 w-60 overflow-hidden rounded-full bg-[#d5f9dc]">
            <div className="loader-progress h-full w-full rounded-full bg-linear-to-r from-[#00c853] via-[#64dd17] to-[#00e676]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_14%,#e8ffe8_0%,#f8fff4_42%,#ffffff_100%)]">
      <Toaster position="top-right" richColors />

      {showMascotaForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-[#9be9ad] bg-white p-5 shadow-[0_16px_40px_rgba(17,86,45,0.24)]">
            <h3 className="text-xl font-bold text-[#0f5f34]">Ayúdanos a mejorar</h3>
            <p className="mt-1 text-sm text-[#247b49]">Gracias por compartir tu sugerencia con la mascota TIC.</p>

            <form onSubmit={handleMascotaSubmit} className="mt-4 space-y-3">
              <input
                name="nombre"
                value={mascotaData.nombre}
                onChange={handleMascotaChange}
                placeholder="Nombre"
                className="w-full rounded-lg border border-[#94dfa5] px-3 py-2 text-sm text-[#123f29] outline-none focus:border-[#2d7a4f]"
                disabled={sendingMascotaForm}
              />
              <input
                name="oficina"
                value={mascotaData.oficina}
                onChange={handleMascotaChange}
                placeholder="De qué oficina eres"
                className="w-full rounded-lg border border-[#94dfa5] px-3 py-2 text-sm text-[#123f29] outline-none focus:border-[#2d7a4f]"
                disabled={sendingMascotaForm}
              />
              <textarea
                name="mejora"
                value={mascotaData.mejora}
                onChange={handleMascotaChange}
                placeholder="En qué podemos mejorar"
                rows={4}
                className="w-full rounded-lg border border-[#94dfa5] px-3 py-2 text-sm text-[#123f29] outline-none focus:border-[#2d7a4f]"
                disabled={sendingMascotaForm}
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMascotaForm(false)}
                  className="rounded-lg border border-[#b9e9c4] px-3 py-2 text-sm font-semibold text-[#247b49]"
                  disabled={sendingMascotaForm}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={sendingMascotaForm}
                  className="rounded-lg bg-[#1f9b4b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#187c3c] disabled:opacity-60"
                >
                  {sendingMascotaForm ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6 md:py-8">
        {auth && (
          <section className="mb-8 rounded-2xl border border-[#c6f3d0] bg-[linear-gradient(140deg,#ffffff_0%,#f7fff2_100%)] p-4 shadow-[0_10px_24px_rgba(17,86,45,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2d7a4f]">Módulos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveModule('support')}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  activeModule === 'support'
                    ? 'border-[#0f9d4b] bg-[#0f9d4b] text-white'
                    : 'border-[#9fe0af] bg-white text-[#1a4d2e] hover:border-[#72cb88]'
                }`}
              >
                Servicio técnico
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('inventory')}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  activeModule === 'inventory'
                    ? 'border-[#0f9d4b] bg-[#0f9d4b] text-white'
                    : 'border-[#9fe0af] bg-white text-[#1a4d2e] hover:border-[#72cb88]'
                }`}
              >
                Inventario
              </button>
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
