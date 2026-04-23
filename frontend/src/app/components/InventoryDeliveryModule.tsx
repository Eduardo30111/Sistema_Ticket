import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getInventoryStockForDelivery, type InventoryStockForDelivery } from '@/lib/api'

/** Solo consulta de stock (existencias). Las salidas / escoger van en la ficha del ticket. */
export function InventoryDeliveryModule() {
  const [stocks, setStocks] = useState<InventoryStockForDelivery[]>([])
  const [loadingStock, setLoadingStock] = useState(true)

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

  return (
    <section className="relative overflow-hidden rounded-4xl border border-[#bde8c8] bg-[linear-gradient(145deg,#ffffff_0%,#f4fff4_58%,#fffde9_100%)] p-6 shadow-[0_24px_60px_rgba(16,98,49,0.12)] md:p-8">
      <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-[#6cff90]/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-[#ffe071]/25 blur-3xl" />

      <div className="relative">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2d7a4f]">Módulo inventario</p>
          <h2 className="text-3xl font-black text-[#114b2a]">Consulta de stock</h2>
          <p className="mt-1 text-sm text-[#2b6a46]">
            Solo lectura: producto, tipo, referencia y cantidad disponible. Para registrar implementos usados en un servicio, ábrelos desde la{' '}
            <strong>ficha técnica del ticket</strong> (botón «Ver productos del inventario»).
          </p>
        </div>
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Las entregas y movimientos de inventario no se gestionan aquí; solo se consulta si hay o no hay en stock.
        </p>

        <div className="overflow-x-auto rounded-2xl border border-[#c8eecf] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#ecfff1] text-left text-[#175638]">
              <tr>
                <th className="px-4 py-3 font-bold">Nombre</th>
                <th className="px-4 py-3 font-bold">Tipo</th>
                <th className="px-4 py-3 font-bold">Referencia</th>
                <th className="px-4 py-3 font-bold">En stock</th>
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
                  <td className="px-4 py-3">{stock.producto || stock.tipo || '—'}</td>
                  <td className="px-4 py-3">{stock.tipo || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{stock.referencia_fabricante || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{stock.cantidad_actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
