import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import robotMascot from '@/assets/RobotTIC.png'
import {
  createInventorySalida,
  getCurrentUser,
  getInventoryDeliveryCatalog,
  getInventoryStockForDelivery,
  type CreateInventorySalidaPayload,
  type InventoryDeliveryOffice,
  type InventoryDeliveryPerson,
  type InventoryStockForDelivery,
} from '@/lib/api'

type SelectedItem = {
  stock: InventoryStockForDelivery
  cantidad: number
}

const MOTIVOS: Array<{ value: CreateInventorySalidaPayload['motivo']; label: string }> = [
  { value: 'INSTALACION', label: 'Instalacion' },
  { value: 'TRASLADO', label: 'Traslado' },
  { value: 'PRESTAMO', label: 'Prestamo' },
  { value: 'BAJA', label: 'Baja por dano' },
  { value: 'EXTRAVIADO', label: 'Extraviado' },
]

export function InventoryDeliveryModule() {
  const [stocks, setStocks] = useState<InventoryStockForDelivery[]>([])
  const [loadingStock, setLoadingStock] = useState(true)
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

  const [showFormBubble, setShowFormBubble] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [offices, setOffices] = useState<InventoryDeliveryOffice[]>([])
  const [people, setPeople] = useState<InventoryDeliveryPerson[]>([])

  const [officeId, setOfficeId] = useState<number | null>(null)
  const [personId, setPersonId] = useState<number | null>(null)
  const [motivo, setMotivo] = useState<CreateInventorySalidaPayload['motivo']>('INSTALACION')
  const [observaciones, setObservaciones] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const currentUser = getCurrentUser()
  const tecnicoNombre = currentUser?.fullName || currentUser?.username || 'Tecnico TIC'
  const tecnicoUsuario = currentUser?.username || 'sin-usuario'

  const selectedCount = selectedItems.reduce((acc, item) => acc + item.cantidad, 0)

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === personId) ?? null,
    [people, personId],
  )

  const peopleByOffice = useMemo(
    () => people.filter((person) => person.oficina_id === officeId),
    [people, officeId],
  )

  useEffect(() => {
    void loadStock()
  }, [])

  const loadStock = async () => {
    setLoadingStock(true)
    try {
      const data = await getInventoryStockForDelivery()
      setStocks(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar stock')
    } finally {
      setLoadingStock(false)
    }
  }

  const loadCatalog = async (officeToFilter?: number | null) => {
    setLoadingCatalog(true)
    try {
      const data = await getInventoryDeliveryCatalog(officeToFilter || undefined)
      setOffices(data.oficinas)
      setPeople(data.personas)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar oficinas y funcionarios')
    } finally {
      setLoadingCatalog(false)
    }
  }

  const addItem = (stock: InventoryStockForDelivery) => {
    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.stock.id === stock.id)
      if (existing) {
        return prev.map((item) => {
          if (item.stock.id !== stock.id) return item
          const next = Math.min(item.cantidad + 1, stock.cantidad_actual)
          return { ...item, cantidad: next }
        })
      }
      return [...prev, { stock, cantidad: 1 }]
    })
  }

  const updateQty = (stockId: number, qty: number) => {
    setSelectedItems((prev) => prev.map((item) => {
      if (item.stock.id !== stockId) return item
      const bounded = Math.max(1, Math.min(qty, item.stock.cantidad_actual))
      return { ...item, cantidad: bounded }
    }))
  }

  const removeItem = (stockId: number) => {
    setSelectedItems((prev) => prev.filter((item) => item.stock.id !== stockId))
  }

  const openDeliveryForm = async () => {
    if (!selectedItems.length) {
      toast.error('Debes escoger al menos un producto del stock')
      return
    }
    await loadCatalog(officeId)
    setShowFormBubble(true)
  }

  const onOfficeChange = async (nextOfficeId: number) => {
    setOfficeId(nextOfficeId)
    setPersonId(null)
    await loadCatalog(nextOfficeId)
  }

  const getImageAsDataUrl = async (imageUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) return null
      const blob = await response.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }

  const getWatermarkImageDataUrl = async (imageUrl: string, opacity = 0.09): Promise<string | null> => {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
        img.src = imageUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = Math.max(0.03, Math.min(opacity, 0.2))
      ctx.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }

  const generateDeliveryPdf = async (args: {
    officeName: string
    personName: string
    personType: string
    personIdNumber: string
    technicianName: string
    technicianUser: string
    items: SelectedItem[]
    reason: string
    notes: string
  }) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const marginX = 14
    const contentWidth = pageWidth - (marginX * 2)
    const mascotDataUrl = await getImageAsDataUrl(robotMascot)
    const watermarkDataUrl = await getWatermarkImageDataUrl(robotMascot)

    const now = new Date()
    const dateStr = now.toLocaleDateString('es-CO')
    const hourStr = now.toLocaleTimeString('es-CO')
    const consecutivo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const totalUnidades = args.items.reduce((acc, item) => acc + item.cantidad, 0)

    if (watermarkDataUrl) {
      const watermarkSize = 130
      const wmX = (pageWidth - watermarkSize) / 2
      const wmY = 80 - (watermarkSize / 2)
      doc.addImage(watermarkDataUrl, 'PNG', wmX, wmY, watermarkSize, watermarkSize)
    }

    doc.setFillColor(31, 58, 84)
    doc.rect(12, 12, pageWidth - 24, 18, 'F')
    doc.setFillColor(210, 220, 232)
    doc.rect(12, 30, pageWidth - 24, 1.9, 'F')

    if (mascotDataUrl) {
      doc.addImage(mascotDataUrl, 'PNG', pageWidth - 35, 15, 13, 13)
    }

    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('OFICINA TIC', pageWidth / 2, 19.5, { align: 'center' })
    doc.setFontSize(8)
    doc.text('CONTROL DE INVENTARIO Y ENTREGA DE IMPLEMENTOS', pageWidth / 2, 25, { align: 'center' })

    doc.setTextColor(28, 28, 28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Formato de inventario por entrega de implementos de trabajo', pageWidth / 2, 38, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Consecutivo: ${consecutivo}`, marginX, 45)
    doc.text(`Fecha y hora: ${dateStr} ${hourStr}`, pageWidth - marginX, 45, { align: 'right' })

    autoTable(doc, {
      startY: 49,
      theme: 'grid',
      margin: { left: marginX, right: marginX },
      head: [['DATOS DE LA ENTREGA', 'DETALLE']],
      body: [
        ['Oficina destino', args.officeName],
        ['Funcionario/Contratista', args.personName],
        ['Tipo de persona', args.personType],
        ['Identificacion', args.personIdNumber],
        ['Motivo de entrega', args.reason],
      ],
      styles: { fontSize: 8.6, cellPadding: 2.1, textColor: [25, 25, 25] },
      headStyles: { fillColor: [47, 79, 112], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: contentWidth - 50 },
      },
    })

    const afterDeliveryY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 70

    autoTable(doc, {
      startY: afterDeliveryY + 4,
      theme: 'grid',
      margin: { left: marginX, right: marginX },
      head: [['DATOS DEL TECNICO', 'DETALLE']],
      body: [
        ['Nombre tecnico', args.technicianName],
        ['Usuario tecnico', args.technicianUser],
      ],
      styles: { fontSize: 8.6, cellPadding: 2.1, textColor: [25, 25, 25] },
      headStyles: { fillColor: [32, 108, 120], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: contentWidth - 50 },
      },
    })

    const beforeItemsY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 92

    autoTable(doc, {
      startY: beforeItemsY + 6,
      theme: 'grid',
      margin: { left: marginX, right: marginX },
      head: [['#', 'Tipo', 'Numero de serie', 'Cantidad']],
      body: args.items.map((item, index) => [
        String(index + 1),
        item.stock.tipo || '-',
        item.stock.numero_serie || 'N/A',
        String(item.cantidad),
      ]),
      foot: [['', '', 'TOTAL UNIDADES', String(totalUnidades)]],
      styles: { fontSize: 8.5, cellPadding: 2.1, textColor: [25, 25, 25] },
      headStyles: { fillColor: [47, 79, 112], textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: [247, 250, 253] },
      footStyles: { fillColor: [232, 238, 246], textColor: [31, 58, 84], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 53 },
        2: { cellWidth: 90 },
        3: { cellWidth: 18, halign: 'center' },
      },
    })

    const tableFinalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 125
    let nextY = tableFinalY + 8

    if (args.notes.trim()) {
      doc.setFillColor(244, 247, 252)
      doc.rect(marginX, nextY - 4, contentWidth, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Observaciones', marginX + 1.5, nextY)
      nextY += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const wrapped = doc.splitTextToSize(args.notes, contentWidth - 4)
      const obsHeight = (wrapped.length * 4.2) + 6
      doc.rect(marginX, nextY - 1.5, contentWidth, obsHeight)
      doc.text(wrapped, marginX + 2, nextY + 2.2)
      nextY += obsHeight + 5
    }

    let signatureY = Math.max(nextY + 16, 245)
    if (signatureY > 280) {
      doc.addPage()
      signatureY = 60
    }

    doc.setDrawColor(60)
    doc.line(20, signatureY, 95, signatureY)
    doc.line(115, signatureY, 190, signatureY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Firma del tecnico', 57.5, signatureY + 6, { align: 'center' })
    doc.text('Firma del funcionario/contratista', 152.5, signatureY + 6, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(args.technicianName, 57.5, signatureY + 11, { align: 'center' })
    doc.text(args.personName, 152.5, signatureY + 11, { align: 'center' })

    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(7.5)
    doc.setTextColor(90, 90, 90)
    doc.text('Documento generado por el modulo de inventario TIC', pageWidth / 2, pageHeight - 8, { align: 'center' })

    if (mascotDataUrl) {
      doc.addImage(mascotDataUrl, 'PNG', marginX, pageHeight - 19, 7.5, 7.5)
    }

    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    doc.save(`formato_entrega_inventario_${stamp}.pdf`)
  }

  const handleDeliver = async () => {
    if (!officeId) {
      toast.error('Selecciona la oficina de destino')
      return
    }
    if (!personId) {
      toast.error('Selecciona el funcionario o contratista de destino')
      return
    }

    const office = offices.find((item) => item.id === officeId)
    const person = people.find((item) => item.id === personId)
    if (!office || !person) {
      toast.error('No se pudieron validar los datos de oficina o funcionario')
      return
    }

    const invalidQty = selectedItems.find((item) => item.cantidad > item.stock.cantidad_actual)
    if (invalidQty) {
      toast.error(`La cantidad para ${invalidQty.stock.tipo} supera lo disponible en stock`)
      return
    }

    setSubmitting(true)
    try {
      for (const item of selectedItems) {
        await createInventorySalida({
          stock: item.stock.id,
          cantidad: item.cantidad,
          motivo,
          oficina_destino: office.id,
          funcionario_destino: person.id,
          observaciones,
        })
      }

      await generateDeliveryPdf({
        officeName: office.nombre,
        personName: person.nombre,
        personType: person.tipo_display,
        personIdNumber: person.identificacion,
        technicianName: tecnicoNombre,
        technicianUser: tecnicoUsuario,
        items: selectedItems,
        reason: MOTIVOS.find((item) => item.value === motivo)?.label || motivo,
        notes: observaciones,
      })

      toast.success('Entrega registrada y formato PDF generado')
      setShowFormBubble(false)
      setSelectedItems([])
      setOfficeId(null)
      setPersonId(null)
      setObservaciones('')
      await loadStock()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la entrega')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-4xl border border-[#bde8c8] bg-[linear-gradient(145deg,#ffffff_0%,#f4fff4_58%,#fffde9_100%)] p-6 shadow-[0_24px_60px_rgba(16,98,49,0.12)] md:p-8">
      <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-[#6cff90]/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-[#ffe071]/25 blur-3xl" />

      <div className="relative">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d7a4f]">Modulo Inventario</p>
            <h2 className="text-3xl font-black text-[#114b2a]">Entrega de implementos por tecnico</h2>
            <p className="mt-1 text-sm text-[#2b6a46]">
              Lista de stock para entrega: categoria, tipo, numero de serie y unidades disponibles.
            </p>
          </div>
          <button
            type="button"
            onClick={openDeliveryForm}
            className="rounded-xl bg-[#0f9d4b] px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(15,157,75,0.3)] transition hover:bg-[#0b843e]"
          >
            Entregar ({selectedCount})
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#c8eecf] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#ecfff1] text-left text-[#175638]">
              <tr>
                <th className="px-4 py-3 font-bold">Tipo</th>
                <th className="px-4 py-3 font-bold">Numero de serie</th>
                <th className="px-4 py-3 font-bold">Disponibles</th>
                <th className="px-4 py-3 font-bold">Accion</th>
              </tr>
            </thead>
            <tbody>
              {loadingStock && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#2d7a4f]">Cargando stock...</td>
                </tr>
              )}
              {!loadingStock && !stocks.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#2d7a4f]">No hay productos disponibles en stock.</td>
                </tr>
              )}
              {!loadingStock && stocks.map((stock) => (
                <tr key={stock.id} className="border-t border-[#edf7ef] text-[#1f5f3b]">
                  <td className="px-4 py-3">{stock.tipo || '-'}</td>
                  <td className="px-4 py-3">{stock.numero_serie || 'N/A'}</td>
                  <td className="px-4 py-3 font-semibold">{stock.cantidad_actual}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => addItem(stock)}
                      className="rounded-lg border border-[#85d79a] bg-[#effff3] px-3 py-1.5 font-semibold text-[#0f7f43] hover:bg-[#dffbe8]"
                    >
                      Escoger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-[#c6ebcf] bg-white/90 p-4">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#2d7a4f]">Productos escogidos</p>
          {!selectedItems.length ? (
            <p className="mt-3 text-sm text-[#4b7d5f]">Aun no has escogido productos.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {selectedItems.map((item) => (
                <div key={item.stock.id} className="grid gap-3 rounded-xl border border-[#d8f2df] bg-[#f8fff9] p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="font-semibold text-[#184f32]">{item.stock.tipo}</p>
                    <p className="text-xs text-[#2a6a45]">Serie: {item.stock.numero_serie || 'N/A'} · Disponibles: {item.stock.cantidad_actual}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-[#2f7250]">Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      max={item.stock.cantidad_actual}
                      value={item.cantidad}
                      onChange={(e) => updateQty(item.stock.id, Number(e.target.value || 1))}
                      className="w-24 rounded-lg border border-[#a6dfb5] px-2 py-1.5 text-sm text-[#1c5b39]"
                    />
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(item.stock.id)}
                      className="rounded-lg border border-[#efb8b8] bg-[#fff3f3] px-3 py-1.5 text-sm font-semibold text-[#a03434]"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showFormBubble && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl rounded-[2rem] border border-[#a8dfb6] bg-[linear-gradient(170deg,#ffffff_0%,#f3fff3_70%,#fffde8_100%)] p-5 shadow-[0_26px_70px_rgba(16,98,49,0.3)] md:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2f7d52]">Burbuja de entrega</p>
                <h3 className="text-2xl font-black text-[#16422a]">Formulario de entrega de inventario</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormBubble(false)}
                className="rounded-lg border border-[#b7e8c5] bg-white px-3 py-1.5 text-sm font-semibold text-[#1d613c]"
              >
                Cerrar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Oficina</label>
                <select
                  value={officeId ?? ''}
                  onChange={(e) => void onOfficeChange(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#9fd9af] bg-white px-3 py-2 text-sm text-[#154f30]"
                  disabled={loadingCatalog || submitting}
                >
                  <option value="">Selecciona oficina</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>{office.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Funcionario / Contratista</label>
                <select
                  value={personId ?? ''}
                  onChange={(e) => setPersonId(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#9fd9af] bg-white px-3 py-2 text-sm text-[#154f30]"
                  disabled={!officeId || submitting}
                >
                  <option value="">Selecciona persona</option>
                  {peopleByOffice.map((person) => (
                    <option key={person.id} value={person.id}>{person.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Tipo de persona</label>
                <input
                  value={selectedPerson?.tipo_display || ''}
                  readOnly
                  className="w-full rounded-xl border border-[#d3ead9] bg-[#f3faf5] px-3 py-2 text-sm text-[#1d603d]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Identificacion</label>
                <input
                  value={selectedPerson?.identificacion || ''}
                  readOnly
                  className="w-full rounded-xl border border-[#d3ead9] bg-[#f3faf5] px-3 py-2 text-sm text-[#1d603d]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Tecnico</label>
                <input
                  value={tecnicoNombre}
                  readOnly
                  className="w-full rounded-xl border border-[#d3ead9] bg-[#f3faf5] px-3 py-2 text-sm text-[#1d603d]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Usuario tecnico</label>
                <input
                  value={tecnicoUsuario}
                  readOnly
                  className="w-full rounded-xl border border-[#d3ead9] bg-[#f3faf5] px-3 py-2 text-sm text-[#1d603d]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Motivo</label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as CreateInventorySalidaPayload['motivo'])}
                  className="w-full rounded-xl border border-[#9fd9af] bg-white px-3 py-2 text-sm text-[#154f30]"
                  disabled={submitting}
                >
                  {MOTIVOS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-[#1e5b39]">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-[#9fd9af] bg-white px-3 py-2 text-sm text-[#154f30]"
                  placeholder="Notas de entrega (opcional)"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFormBubble(false)}
                className="rounded-xl border border-[#badfc4] bg-white px-4 py-2 text-sm font-semibold text-[#21663d]"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeliver()}
                className="rounded-xl bg-[#0f9d4b] px-5 py-2 text-sm font-bold text-white shadow-[0_10px_22px_rgba(15,157,75,0.32)] hover:bg-[#0c853f] disabled:opacity-60"
                disabled={submitting || loadingCatalog}
              >
                {submitting ? 'Entregando...' : 'Confirmar entrega y generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
