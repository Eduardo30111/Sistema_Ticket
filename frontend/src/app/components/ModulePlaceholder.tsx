interface ModulePlaceholderProps {
  title: string
  summary: string
  accent: 'emerald' | 'amber'
}

const accentStyles = {
  emerald: {
    badge: 'border-[#8fe3a3] bg-[#eaffef] text-[#0f7f43]',
    panel: 'border-[#9fe0af] bg-[linear-gradient(135deg,#f0fff3_0%,#f8fff2_48%,#fffde8_100%)]',
    glow: 'bg-[#61ff7c]/18',
    dot: 'bg-[#14c768]',
  },
  amber: {
    badge: 'border-[#e5d185] bg-[#fff9df] text-[#8b6500]',
    panel: 'border-[#ead68b] bg-[linear-gradient(135deg,#fffdf0_0%,#fff8e1_52%,#ffffff_100%)]',
    glow: 'bg-[#ffd54f]/18',
    dot: 'bg-[#f0b429]',
  },
} as const

export function ModulePlaceholder({ title, summary, accent }: ModulePlaceholderProps) {
  const styles = accentStyles[accent]

  return (
    <section className="relative overflow-hidden rounded-4xl border border-[#cdeed4] bg-white/90 p-6 shadow-[0_24px_70px_rgba(16,98,49,0.12)] md:p-8">
      <div className={`pointer-events-none absolute -right-14 top-0 h-40 w-40 rounded-full blur-3xl ${styles.glow}`} />
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] ${styles.badge}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        Módulo en preparación
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="text-3xl font-black text-[#114b2a] md:text-4xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#2d7a4f] md:text-base">{summary}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#d5efd9] bg-white px-4 py-3 text-sm font-semibold text-[#21663d] shadow-[0_10px_24px_rgba(11,88,40,0.06)]">
              Estructura base lista
            </div>
            <div className="rounded-2xl border border-[#d5efd9] bg-white px-4 py-3 text-sm font-semibold text-[#21663d] shadow-[0_10px_24px_rgba(11,88,40,0.06)]">
              UI reservada para siguientes iteraciones
            </div>
            <div className="rounded-2xl border border-[#d5efd9] bg-white px-4 py-3 text-sm font-semibold text-[#21663d] shadow-[0_10px_24px_rgba(11,88,40,0.06)]">
              Backend preparado para crecer
            </div>
          </div>
        </div>

        <div className={`rounded-[1.75rem] border p-5 shadow-[0_14px_34px_rgba(17,86,45,0.08)] ${styles.panel}`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#4d7a5d]">Estado actual</p>
          <p className="mt-3 text-2xl font-black text-[#16422a]">Sin pantallas funcionales</p>
          <p className="mt-3 text-sm leading-6 text-[#2b6a46]">
            Este espacio queda habilitado como contenedor inicial del módulo. En el siguiente paso se pueden incorporar catálogo, formularios, flujos y permisos específicos.
          </p>
        </div>
      </div>
    </section>
  )
}