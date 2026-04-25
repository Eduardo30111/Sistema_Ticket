import { Zap, Activity, Gauge } from 'lucide-react'

interface DailyRepairsCounterProps {
  myRepairsToday: number
  totalRepairsToday: number
}

export function DailyRepairsCounter({ myRepairsToday, totalRepairsToday }: DailyRepairsCounterProps) {
  const percentage = totalRepairsToday > 0 ? Math.round((myRepairsToday / totalRepairsToday) * 100) : 0

  return (
    <div className="digital-card relative mb-6 min-w-0 overflow-hidden rounded-2xl p-4 sm:p-6">
      <div className="pointer-events-none absolute" />

      <div className="flex flex-col gap-4 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[#92d8dc] bg-[#effdff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0f6d72] sm:text-[11px] sm:tracking-[0.18em]">
            <Activity className="size-3 shrink-0" /> Rendimiento diario
          </p>
          <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[#11494d]">
            <span className="font-mono text-4xl font-black sm:text-5xl">{myRepairsToday}</span>
            {totalRepairsToday > 0 && (
              <span className="font-mono text-lg font-bold text-[#2f7377] sm:text-xl">
                / {totalRepairsToday}
              </span>
            )}
            <span className="text-lg font-semibold text-[#2f7377] sm:text-xl">
              {myRepairsToday === 1 ? 'reparación' : 'reparaciones'}
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#2f7377] sm:gap-3">
            <p className="min-w-0 max-w-full font-semibold [overflow-wrap:anywhere]">
              {myRepairsToday === 0
                ? 'Sin cierres aún, activa una tarea.'
                : myRepairsToday === 1
                  ? 'Buen arranque, sigue así.'
                  : 'Excelente ritmo de resolución.'}
            </p>
            {totalRepairsToday > 0 && (
              <span className="shrink-0 rounded-full border border-[#b4e868] bg-[#f7ffe5] px-3 py-1 font-black text-[#496b16]">
                {percentage}%
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center min-[380px]:justify-end">
          <div className="relative h-20 w-20 rounded-full border border-[#87d5d9] bg-[radial-gradient(circle,#f5ffff_0%,#e9fcff_70%,#dcfcf1_100%)] shadow-[0_10px_28px_rgba(15,108,112,0.2)] sm:h-24 sm:w-24">
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#19bac3] border-r-[#9ae35d] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="h-8 w-8 text-[#11aeb7] sm:h-10 sm:w-10" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2 sm:mt-6">
        <div className="flex flex-col gap-1.5 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <span className="inline-flex min-w-0 max-w-full items-start gap-1 font-semibold text-[#2f7377] [overflow-wrap:anywhere]">
            <Gauge className="mt-0.5 size-3 shrink-0" />
            {totalRepairsToday > 0 ? `Tu aporte: ${myRepairsToday}/${totalRepairsToday}` : 'Sin reparaciones registradas hoy'}
          </span>
          <span className="shrink-0 font-black text-[#3f701d] sm:text-right">
            {totalRepairsToday > 0
              ? `${percentage}% del total`
              : '0% del total'}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-[#9fdcdf] bg-[#e4fcff]">
          <div
            className="h-full bg-linear-to-r from-[#18bbc3] via-[#53d5dc] to-[#a7e764] transition-all duration-500"
            style={{
              width: `${Math.min(totalRepairsToday > 0 ? (myRepairsToday / totalRepairsToday) * 100 : 0, 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
