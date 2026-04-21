import { Zap, Activity, Gauge } from 'lucide-react'

interface DailyRepairsCounterProps {
  myRepairsToday: number
  totalRepairsToday: number
}

export function DailyRepairsCounter({ myRepairsToday, totalRepairsToday }: DailyRepairsCounterProps) {
  const percentage = totalRepairsToday > 0 ? Math.round((myRepairsToday / totalRepairsToday) * 100) : 0

  return (
    <div className="digital-card mb-6 overflow-hidden rounded-2xl p-6">
      <div className="pointer-events-none absolute" />

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#92d8dc] bg-[#effdff] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#0f6d72]">
            <Activity className="size-3" /> Rendimiento diario
          </p>
          <h2 className="text-[#11494d]">
            <span className="font-mono text-5xl font-black">{myRepairsToday}</span>
            {totalRepairsToday > 0 && (
              <span className="ml-2 font-mono text-xl font-bold text-[#2f7377]">
                / {totalRepairsToday}
              </span>
            )}
            <span className="ml-2 text-xl font-semibold text-[#2f7377]">
              {myRepairsToday === 1 ? 'reparación' : 'reparaciones'}
            </span>
          </h2>

          <div className="flex items-center gap-3 text-xs text-[#2f7377]">
            <p className="font-semibold">
              {myRepairsToday === 0
                ? 'Sin cierres aún, activa una tarea.'
                : myRepairsToday === 1
                  ? 'Buen arranque, sigue así.'
                  : 'Excelente ritmo de resolución.'}
            </p>
            {totalRepairsToday > 0 && (
              <span className="rounded-full border border-[#b4e868] bg-[#f7ffe5] px-3 py-1 font-black text-[#496b16]">
                {percentage}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="relative h-24 w-24 rounded-full border border-[#87d5d9] bg-[radial-gradient(circle,#f5ffff_0%,#e9fcff_70%,#dcfcf1_100%)] shadow-[0_10px_28px_rgba(15,108,112,0.2)]">
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#19bac3] border-r-[#9ae35d] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="h-10 w-10 text-[#11aeb7]" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-[#2f7377]">
            <Gauge className="size-3" />
            {totalRepairsToday > 0 ? `Tu aporte: ${myRepairsToday}/${totalRepairsToday}` : 'Sin reparaciones registradas hoy'}
          </span>
          <span className="font-black text-[#3f701d]">
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
