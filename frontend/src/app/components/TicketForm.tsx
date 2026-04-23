import { useEffect, useMemo, useState } from 'react'
import {
  createTicket,
  getOfficeCatalog,
  getPublicOffices,
  reviewPublicTicket,
  requestPublicTicketDelay,
  type OfficeCatalog,
  type PublicOffice,
  type PublicTicketReview,
} from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, CheckCircle, QrCode, LogIn, Building2, ArrowLeft, Info, Search, X, Ticket } from 'lucide-react'
import robotMascot from '@/assets/RobotTIC.png'

export function TicketForm() {
  const [step, setStep] = useState<'login' | 'form'>('login')
  const [loading, setLoading] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null)
  const [offices, setOffices] = useState<PublicOffice[]>([])
  const [catalog, setCatalog] = useState<OfficeCatalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [reviewFabOpen, setReviewFabOpen] = useState(false)
  const [reviewConsultCedula, setReviewConsultCedula] = useState('')
  const [reviewConsultLoading, setReviewConsultLoading] = useState(false)
  const [reviewConsultResult, setReviewConsultResult] = useState<PublicTicketReview | null>(null)
  const [reviewDelaySubmitting, setReviewDelaySubmitting] = useState(false)
  const [, setReviewDelayBump] = useState(0)
  const [identityVerified, setIdentityVerified] = useState(false)
  const [loginCedula, setLoginCedula] = useState('')
  const [loginOfficeCode, setLoginOfficeCode] = useState('')
  const [formData, setFormData] = useState({
    qrValue: '',
    officeCode: '',
    personType: '',
    personRef: '',
    personName: '',
    personId: '',
    dependencia: '',
    equipmentType: '',
    equipmentSerial: '',
    equipmentSerialOther: '',
    damageType: '',
    description: '',
    email: '',
    phone: '',
  })

  useEffect(() => {
    const loadOffices = async () => {
      try {
        const data = await getPublicOffices()
        setOffices(data)

        const params = new URLSearchParams(window.location.search)
        const qrParam = (params.get('qr') || params.get('officeCode') || '').trim()
        if (qrParam) {
          const officeCode = qrParam.toUpperCase().startsWith('OFICINA:') ? qrParam.split(':', 2)[1] : qrParam
          setLoginOfficeCode(qrParam)
          setFormData((prev) => ({
            ...prev,
            qrValue: qrParam,
            officeCode: officeCode,
          }))
          await loadCatalog(qrParam)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudieron cargar oficinas')
      }
    }
    void loadOffices()
  }, [])

  const loadCatalog = async (qrOrCode: string, personId?: string) => {
    setLoadingCatalog(true)
    try {
      const data = await getOfficeCatalog(qrOrCode, personId)
      setCatalog(data)
      setFormData((prev) => ({
        ...prev,
        officeCode: data.office.codigo,
        dependencia: data.office.nombre,
        qrValue: data.office.qr_payload,
      }))
      return data
    } finally {
      setLoadingCatalog(false)
    }
  }

  const equipmentByType = useMemo(() => {
    const source = catalog?.equipment || []
    return source.reduce((acc, item) => {
      const key = item.tipo.trim().toLowerCase()
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {} as Record<string, OfficeCatalog['equipment']>)
  }, [catalog])

  const equipmentTypes = useMemo(() => {
    return Object.keys(equipmentByType).sort()
  }, [equipmentByType])

  const serialOptions = useMemo(() => {
    const key = formData.equipmentType.trim().toLowerCase()
    return equipmentByType[key] || []
  }, [equipmentByType, formData.equipmentType])

  useEffect(() => {
    if (
      !reviewConsultResult ||
      reviewConsultResult.asignado ||
      reviewConsultResult.demorado_publico ||
      reviewConsultResult.estado === 'CERRADO'
    ) {
      return
    }
    const id = window.setInterval(() => setReviewDelayBump((n) => n + 1), 5000)
    return () => window.clearInterval(id)
  }, [reviewConsultResult])

  const selectedEquipment = useMemo(() => {
    if (!formData.equipmentSerial) return null
    return serialOptions.find((item) => item.serie === formData.equipmentSerial) || null
  }, [serialOptions, formData.equipmentSerial])

  const handleChangeOffice = () => {
    setCatalog(null)
    setIdentityVerified(false)
    setStep('login')
    setLoginCedula('')
    setLoginOfficeCode('')
    setFormData((prev) => ({
      ...prev,
      qrValue: '',
      officeCode: '',
      personType: '',
      personRef: '',
      personName: '',
      personId: '',
      dependencia: '',
      equipmentType: '',
      equipmentSerial: '',
      equipmentSerialOther: '',
    }))
  }

  const activePeople = useMemo(() => {
    if (!catalog) return []
    const funcionarios = catalog.people.funcionarios.map((p) => ({ ...p, kind: 'FUNCIONARIO' as const }))
    const contratistas = catalog.people.contratistas.map((p) => ({ ...p, kind: 'CONTRATISTA' as const }))
    return [...funcionarios, ...contratistas]
  }, [catalog])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target

    if (name === 'officeCode') {
      const office = offices.find((o) => o.codigo === value)
      setCatalog(null)
      setIdentityVerified(false)
      setLoginOfficeCode(office?.qr_payload || value)
      setFormData((prev) => ({
        ...prev,
        officeCode: value,
        qrValue: office?.qr_payload || value,
        dependencia: office?.nombre || '',
        personType: '',
        personRef: '',
        personName: '',
        personId: '',
        equipmentType: '',
        equipmentSerial: '',
        equipmentSerialOther: '',
      }))
      return
    }

    if (name === 'personId') {
      setIdentityVerified(false)
      setCatalog((prev) => prev ? { ...prev, people: { funcionarios: [], contratistas: [] }, equipment: [] } : prev)
      setFormData((prev) => ({
        ...prev,
        personId: value,
        personType: '',
        personRef: '',
        personName: '',
        equipmentType: '',
        equipmentSerial: '',
        equipmentSerialOther: '',
      }))
      return
    }

    if (name === 'personRef') {
      const [kind, idStr] = value.split(':')
      const id = Number(idStr)
      const person = activePeople.find((p) => p.kind === kind && p.id === id)
      setFormData((prev) => ({
        ...prev,
        personRef: value,
        personType: kind || '',
        personName: person?.nombre || '',
        personId: person?.identificacion || '',
        email: person?.correo || prev.email,
        phone: person?.telefono || prev.phone,
      }))
      return
    }

    if (name === 'equipmentType') {
      setFormData((prev) => ({
        ...prev,
        equipmentType: value,
        equipmentSerial: '',
        equipmentSerialOther: '',
      }))
      return
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleVerifyIdentity = async () => {
    const cedula = loginCedula.trim()
    const qrOrCode = loginOfficeCode.trim() || formData.qrValue.trim() || formData.officeCode.trim()

    if (!cedula) {
      toast.error('Ingresa tu cédula para ingresar')
      return
    }

    if (!qrOrCode) {
      toast.error('Selecciona primero la oficina')
      return
    }

    try {
      const data = await loadCatalog(qrOrCode, cedula)
      const verifiedPerson =
        data.people.funcionarios[0] ?? data.people.contratistas[0]
      if (!verifiedPerson) {
        toast.error(
          'No hay una persona activa y vigente con esa cédula en esta oficina. Si eres contratista, revisa las fechas de tu contrato.',
        )
        return
      }

      const personType = verifiedPerson.tipo
      setFormData((prev) => ({
        ...prev,
        personType,
        personRef: `${personType}:${verifiedPerson.id}`,
        personName: verifiedPerson.nombre,
        personId: verifiedPerson.identificacion,
        email: verifiedPerson.correo || prev.email,
        phone: verifiedPerson.telefono || prev.phone,
      }))
      setIdentityVerified(true)
      setStep('form')
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.startsWith('OTRA_OFICINA:')) {
        const oficinaNombre = msg.slice('OTRA_OFICINA:'.length)
        toast.error(`Tu cédula pertenece a la oficina "${oficinaNombre}", no a esta.`)
      } else if (msg === 'DESACTIVADO') {
        toast.warning('Tu usuario está desactivado. Contacta al administrador para reactivarlo.')
      } else if (msg === 'NO_ENCONTRADO') {
        toast.error('Esta cédula no se encuentra registrada en el sistema.')
      } else {
        toast.error(msg || 'No se pudo validar la cédula')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.personName.trim() ||
      !formData.personId.trim() ||
      !identityVerified ||
      !formData.dependencia.trim() ||
      !formData.officeCode.trim() ||
      !formData.equipmentType.trim() ||
      !formData.equipmentSerial.trim() ||
      !formData.damageType.trim() ||
      !formData.description.trim()
    ) {
      toast.error('Completa los campos obligatorios para crear el ticket')
      return
    }

    const equipmentSerialPayload =
      formData.equipmentSerial === '__OTRO__'
        ? `OTRO:${formData.equipmentSerialOther.trim()}`
        : formData.equipmentSerial

    if (formData.equipmentSerial === '__OTRO__' && !formData.equipmentSerialOther.trim()) {
      toast.error('Ingresa el serial del equipo personal')
      return
    }

    setLoading(true)
    try {
      const result = await createTicket({
        personName: formData.personName,
        personId: formData.personId,
        equipmentType: formData.equipmentType,
        equipmentSerial: equipmentSerialPayload,
        damageType: formData.damageType,
        description: formData.description,
        dependencia: formData.dependencia,
        officeCode: formData.officeCode,
        email: formData.email,
        phone: formData.phone,
      })
      toast.success(`Ticket creado exitosamente. ID: ${result.ticketId}`)
      setCreatedTicketId(result.ticketId)
      setShowSuccessModal(true)
      setFormData({
        qrValue: '',
        officeCode: '',
        personType: '',
        personRef: '',
        personName: '',
        personId: '',
        dependencia: '',
        equipmentType: '',
        equipmentSerial: '',
        equipmentSerialOther: '',
        damageType: '',
        description: '',
        email: '',
        phone: '',
      })
      setCatalog(null)
      setIdentityVerified(false)
      setStep('login')
      setLoginCedula('')
      setTimeout(() => setShowSuccessModal(false), 4500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el ticket')
    } finally {
      setLoading(false)
    }
  }

  const closeReviewFab = () => {
    setReviewFabOpen(false)
    setReviewConsultCedula('')
    setReviewConsultResult(null)
    setReviewDelaySubmitting(false)
  }

  const handleReviewConsult = async () => {
    const cedula = reviewConsultCedula.trim()
    if (!cedula) {
      toast.error('Ingresa tu cédula')
      return
    }
    setReviewConsultLoading(true)
    try {
      const result = await reviewPublicTicket(cedula)
      setReviewConsultResult(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revisar el ticket')
      setReviewConsultResult(null)
    } finally {
      setReviewConsultLoading(false)
    }
  }

  const handlePublicDelayRequest = async () => {
    if (!reviewConsultResult) return
    const cedula = reviewConsultCedula.trim()
    setReviewDelaySubmitting(true)
    try {
      const updated = await requestPublicTicketDelay(cedula, reviewConsultResult.ticketId)
      setReviewConsultResult(updated)
      toast.success('Se notificó al equipo técnico. El ticket queda marcado como demorado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar la solicitud')
    } finally {
      setReviewDelaySubmitting(false)
    }
  }

  return (
    <>
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-xl">
            <img
              src={robotMascot}
              alt="Robot TIC"
              className="robot-clean loader-robot mx-auto mb-3 h-28 w-28 object-contain"
            />
            <CheckCircle className="mx-auto mb-2 size-9 text-green-700" />
            <h3 className="text-xl font-semibold text-zinc-900">Ticket registrado</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Ticket n.º {createdTicketId ?? '-'} listo.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Acceso flotante a consulta de ticket (solo cédula) — cápsula discreta, sin animaciones llamativas */}
      <div className="fixed bottom-6 right-5 z-[60] md:bottom-8 md:right-8">
        <div className="group relative isolate">
          <div
            className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 w-max max-w-[min(16rem,calc(100vw-2.5rem))] -translate-x-1/2 translate-y-1 scale-[0.98] opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
            role="tooltip"
          >
            <div className="relative rounded-xl bg-[#0f2918] px-3 py-2 text-center text-[11px] leading-snug font-medium text-white/95 shadow-[0_12px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/10">
              Consulta tu ticket con la cédula
              <span
                className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-[#0f2918] shadow-[1px_1px_0_rgba(255,255,255,0.06)]"
                aria-hidden
              />
            </div>
          </div>

          <button
            type="button"
            title="Consultar estado de tu ticket"
            aria-label="Consultar estado de tu ticket con tu cédula"
            onClick={() => {
              setReviewFabOpen(true)
              setReviewConsultResult(null)
              setReviewConsultCedula('')
            }}
            className="relative flex h-[3.25rem] items-center gap-2.5 overflow-hidden rounded-full border border-emerald-200/70 bg-white/80 py-1 pl-1.5 pr-3.5 shadow-[0_2px_16px_rgba(15,60,30,0.06),0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-md transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out hover:-translate-y-px hover:border-emerald-300/90 hover:bg-white/95 hover:shadow-[0_8px_28px_rgba(15,60,30,0.1)] active:translate-y-0 active:shadow-[0_2px_12px_rgba(15,60,30,0.06)] sm:pr-4"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2d7a4f] to-[#1a4d2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
              aria-hidden
            >
              <Ticket className="size-[1.05rem]" strokeWidth={2} />
            </span>
            <span className="hidden min-w-0 flex-col text-left sm:flex">
              <span className="truncate text-[12.5px] font-semibold tracking-tight text-[#0f2918]">Mi ticket</span>
              <span className="truncate text-[10px] font-medium text-emerald-800/65">Solo cédula</span>
            </span>
          </button>
        </div>
      </div>

      {reviewFabOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div
            className={`relative w-full max-w-md rounded-2xl border-2 p-6 shadow-xl ${
              reviewConsultResult?.demorado_publico
                ? 'border-red-400 bg-[#fff5f5]'
                : 'border-[#81c784] bg-white'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-fab-title"
          >
            <button
              type="button"
              onClick={closeReviewFab}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[#2d7a4f] transition hover:bg-[#e8f5e9]"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
            <h3 id="review-fab-title" className="pr-10 text-lg font-bold text-[#165b35]">
              Consultar ticket
            </h3>
            <p className="mt-1 text-sm text-[#2d7a4f]">
              Ingresa tu cédula. Mostramos tu ticket abierto más reciente vinculado a ese documento.
            </p>
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-medium text-[#1a4d2e]">Cédula</label>
              <input
                type="text"
                value={reviewConsultCedula}
                onChange={(e) => setReviewConsultCedula(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleReviewConsult()}
                placeholder="Ej: 12345678"
                className="w-full rounded-lg border border-[#81c784] px-3 py-2.5 text-black"
                disabled={reviewConsultLoading}
              />
              <button
                type="button"
                onClick={() => void handleReviewConsult()}
                disabled={reviewConsultLoading || !reviewConsultCedula.trim()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2d7a4f] py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {reviewConsultLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Consultar
              </button>
            </div>

            {reviewConsultResult && (() => {
              const r = reviewConsultResult
              const canDelayFlow =
                !r.asignado && r.estado !== 'CERRADO' && !r.demorado_publico
              const createdMs = new Date(r.fecha_creacion).getTime()
              const delayEligible = canDelayFlow && Date.now() - createdMs >= 3600000
              const minsLeft = Math.max(0, Math.ceil((createdMs + 3600000 - Date.now()) / 60000))
              return (
                <div
                  className={`mt-5 space-y-2 rounded-xl border p-4 text-sm ${
                    r.demorado_publico
                      ? 'border-red-300 bg-red-50 text-red-950'
                      : 'border-[#c8e6c9] bg-[#f7fff8] text-[#1a4d2e]'
                  }`}
                >
                  {r.demorado_publico && (
                    <p className="rounded-lg border border-red-400 bg-red-100 px-3 py-2 text-center font-bold uppercase tracking-wide text-red-800">
                      Demorado
                    </p>
                  )}
                  <p>
                    <strong>Ticket:</strong> #{r.ticketId}
                  </p>
                  <p>
                    <strong>Estado:</strong> {r.estado}
                  </p>
                  <p>
                    <strong>Creado:</strong> {new Date(r.fecha_creacion).toLocaleString()}
                  </p>
                  <p>
                    <strong>Técnico asignado al ticket:</strong>{' '}
                    {r.asignado ? (r.atendido_por || 'En curso') : 'No — pendiente de asignación'}
                  </p>
                  {r.atendido_por && r.estado === 'CERRADO' && (
                    <p>
                      <strong>Atendido por:</strong> {r.atendido_por}
                    </p>
                  )}
                  {r.procedimiento && (
                    <p>
                      <strong>Procedimiento:</strong> {r.procedimiento}
                    </p>
                  )}

                  {canDelayFlow && (
                    <div className="mt-3 border-t border-[#b2dfdb] pt-3">
                      {!delayEligible ? (
                        <p className="text-xs text-[#1565c0]">
                          Si pasan <strong>1 hora</strong> sin que un técnico quede asignado al ticket, podrás avisar al
                          equipo. Faltan aprox. <strong>{minsLeft}</strong> min.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handlePublicDelayRequest()}
                          disabled={reviewDelaySubmitting}
                          className="w-full rounded-lg bg-[#c62828] py-2.5 text-sm font-semibold text-white transition hover:bg-[#b71c1c] disabled:opacity-50"
                        >
                          {reviewDelaySubmitting ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <Loader2 className="size-4 animate-spin" />
                              Enviando…
                            </span>
                          ) : (
                            'Avisar demora al equipo técnico'
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {step === 'login' ? (
        /* ── LOGIN SCREEN ── */
        <div className="flex min-h-[520px] items-center justify-center py-6">
          <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-md">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 text-center">
              <img src={robotMascot} alt="Robot TIC" className="h-20 w-20 object-contain" />
              <h2 className="text-xl font-extrabold text-[#165b35]">Sistema de Tickets TIC</h2>
              {catalog ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleChangeOffice}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#8fe0a0] bg-[#f0fff4] px-3 py-1 text-xs font-semibold text-[#1f7a43] transition hover:bg-[#e7ffed]"
                  >
                    <Building2 className="size-3.5" />
                    {catalog.office.nombre}
                  </button>
                  <p className="text-[11px] text-[#2d7a4f]">Pulsa el nombre de la oficina para escoger otra</p>
                </div>
              ) : (
                <p className="text-xs text-[#4a9a6b]">Ingresa con tu cédula para solicitar soporte</p>
              )}
            </div>

            {/* Office selector — only if no office loaded yet */}
            {!catalog && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1a4d2e]">Selecciona tu oficina</label>
                <select
                  value={formData.officeCode}
                  onChange={(e) => handleChange({ target: { name: 'officeCode', value: e.target.value } } as React.ChangeEvent<HTMLSelectElement>)}
                  className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2.5 text-black focus:border-[#2d7a4f] focus:outline-none"
                  disabled={loadingCatalog}
                >
                  <option value="">— Selecciona oficina —</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.codigo}>
                      {office.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Cedula input */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Número de cédula</label>
              <input
                type="text"
                value={loginCedula}
                onChange={(e) => setLoginCedula(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleVerifyIdentity()}
                placeholder="Ej: 12345678"
                autoFocus
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2.5 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
                disabled={loadingCatalog}
              />
            </div>

            {/* Login button */}
            <button
              type="button"
              onClick={() => void handleVerifyIdentity()}
              disabled={loadingCatalog || !loginCedula.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2d7a4f] py-3 font-semibold text-white transition hover:bg-[#1f6a42] disabled:opacity-50"
            >
              {loadingCatalog ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              Ingresar
            </button>

            {/* QR hint */}
            {!catalog && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-[#6aad88]">
                <QrCode className="size-3.5" />
                También puedes escanear el QR de la oficina
              </p>
            )}
          </div>
        </div>
      ) : (
        /* ── TICKET FORM ── */
        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border-2 border-[#81c784] bg-white p-6 shadow-sm md:p-7">
          {/* User header */}
          <div className="flex items-center justify-between rounded-xl border border-[#9de0ad] bg-[linear-gradient(130deg,#f2fff4_0%,#faffef_45%,#fffde8_100%)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#165b35]">{formData.personName}</p>
              <p className="text-xs text-[#2d7a4f]">
                {formData.personType === 'FUNCIONARIO' ? 'Funcionario' : 'Contratista'} · {formData.dependencia}
              </p>
            </div>
            <button
              type="button"
              onClick={handleChangeOffice}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#81c784] px-3 py-1.5 text-xs font-semibold text-[#2d7a4f] transition hover:bg-[#e8f5e9]"
            >
              <ArrowLeft className="size-3.5" />
              Cambiar oficina
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Tipo de equipo *</label>
              <select
                name="equipmentType"
                value={formData.equipmentType}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                disabled={loading || !catalog}
              >
                <option value="">Selecciona tipo</option>
                {equipmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Serial del equipo *</label>
              <select
                name="equipmentSerial"
                value={formData.equipmentSerial}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                disabled={loading || !formData.equipmentType}
              >
                <option value="">Selecciona serial</option>
                {serialOptions.map((item) => (
                  <option key={`${item.id}-${item.serie}`} value={item.serie}>
                    {item.serie}
                  </option>
                ))}
                <option value="__OTRO__">Otro (equipo personal)</option>
              </select>
              {formData.equipmentSerial === '__OTRO__' && (
                <input
                  type="text"
                  name="equipmentSerialOther"
                  value={formData.equipmentSerialOther}
                  onChange={handleChange}
                  placeholder="Serial del equipo personal"
                  className="mt-2 w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                  disabled={loading}
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Tipo de Daño *</label>
              <select
                name="damageType"
                value={formData.damageType}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                disabled={loading}
              >
                <option value="">Selecciona un tipo de daño</option>
                <option value="Daño físico">Daño físico</option>
                <option value="Problema en el sistema">Problema en el sistema</option>
                <option value="Red">Problema de Red</option>
                <option value="Equipo lento">Equipo lento</option>
                <option value="Acceso">Problemas de Acceso</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Modelo detectado</label>
              <input
                type="text"
                value={selectedEquipment?.modelo || ''}
                readOnly
                className="w-full rounded-lg border border-[#d2e8d7] bg-[#f6fff8] px-4 py-2 text-[#236445]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Correo</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                readOnly
                tabIndex={-1}
                title="Tomado de tu registro al validar la cédula"
                className="w-full cursor-default rounded-lg border border-[#d2e8d7] bg-[#f6fff8] px-4 py-2 text-[#236445] focus:outline-none"
                disabled={loading}
              />
              <p className="text-[11px] text-[#5a9a72]">Se completa automáticamente con tu registro</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Teléfono</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                readOnly
                tabIndex={-1}
                title="Tomado de tu registro al validar la cédula"
                className="w-full cursor-default rounded-lg border border-[#d2e8d7] bg-[#f6fff8] px-4 py-2 text-[#236445] focus:outline-none"
                disabled={loading}
              />
              <p className="text-[11px] text-[#5a9a72]">Se completa automáticamente con tu registro</p>
            </div>
          </div>

          {formData.damageType === 'Otro' && (
            <div
              role="status"
              className="flex gap-2.5 rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-amber-100/95 px-4 py-3 text-sm text-amber-950 shadow-sm ring-1 ring-amber-100/80"
            >
              <Info className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
              <p>
                Especifica el tipo de daño o el síntoma en el campo <span className="font-semibold">Descripción del problema</span>.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#1a4d2e]">Descripción del problema *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe en detalle el problema..."
              rows={4}
              className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black placeholder-gray-400 focus:border-[#2d7a4f] focus:outline-none"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#2d7a4f] py-2.5 font-semibold text-white transition hover:bg-[#1f6a42] disabled:opacity-50"
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
      )}
    </>
  )
}
