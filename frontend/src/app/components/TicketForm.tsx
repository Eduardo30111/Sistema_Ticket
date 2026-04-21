import { useEffect, useMemo, useState } from 'react'
import { createTicket, getOfficeCatalog, getPublicOffices, type OfficeCatalog, type PublicOffice } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, CheckCircle, QrCode, LogIn, Building2, ArrowLeft } from 'lucide-react'
import robotMascot from '@/assets/RobotTIC.png'

export function TicketForm() {
  const [step, setStep] = useState<'login' | 'form'>('login')
  const [loading, setLoading] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null)
  const [offices, setOffices] = useState<PublicOffice[]>([])
  const [catalog, setCatalog] = useState<OfficeCatalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
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
      const verifiedPerson = data.people.funcionarios[0] || data.people.contratistas[0]
      if (!verifiedPerson) {
        toast.error('No se encontró persona activa para esta cédula en la oficina')
        return
      }

      const personType = data.people.funcionarios.length ? 'FUNCIONARIO' : 'CONTRATISTA'
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

  return (
    <>
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-[#8fe0a0] bg-white p-6 text-center shadow-[0_20px_45px_rgba(17,86,45,0.28)]">
            <img
              src={robotMascot}
              alt="Robot TIC"
              className="mx-auto mb-3 h-28 w-28 animate-bounce object-contain"
            />
            <CheckCircle className="mx-auto mb-2 size-9 text-[#1f9b4b]" />
            <h3 className="text-2xl font-extrabold text-[#165b35]">Ticket listo</h3>
            <p className="mt-2 text-sm text-[#1f7a43]">
              Ticket numero #{createdTicketId ?? '-'} esta listo.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="mt-4 rounded-lg bg-[#1f9b4b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#187c3c]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {step === 'login' ? (
        /* ── LOGIN SCREEN ── */
        <div className="flex min-h-[520px] items-center justify-center py-6">
          <div className="w-full max-w-sm space-y-6 rounded-2xl border-2 border-[#81c784] bg-white p-8 shadow-lg">
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
              <label className="block text-sm font-medium text-[#1a4d2e]">Email (opcional)</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-[#1a4d2e]">Teléfono (opcional)</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#81c784] bg-white px-4 py-2 text-black focus:border-[#2d7a4f] focus:outline-none"
                disabled={loading}
              />
            </div>
          </div>

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
