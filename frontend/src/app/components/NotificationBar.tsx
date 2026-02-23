import { useEffect, useState, useRef } from 'react'
import { obtenerMisTareas } from '@/lib/tareas'
import { getCurrentUser } from '@/lib/api'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'

function wsUrlForUser(userId: number) {
  const loc = window.location
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws'
  const host = loc.hostname
  const port = loc.port || (loc.protocol === 'https:' ? '443' : '80')
  return `${protocol}://${host}:8000/ws/notifications/${userId}/`
}

export function NotificationBar() {
  const [count, setCount] = useState(0)
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let prevIds: number[] = []
    const wsRef = { current: null as WebSocket | null }

    async function poll() {
      const user = getCurrentUser()
      if (!user?.id) return
      // ensure WS connected
      if (!wsRef.current) {
        try {
          const url = wsUrlForUser(user.id)
          const ws = new WebSocket(url)
          ws.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data)
              if (data?.type === 'task_assigned') {
                const msg = data.message
                setCount((c) => c + 1)
                setLatest(typeof msg === 'string' ? msg : JSON.stringify(msg))
                toast(`Nueva tarea asignada: ${msg?.ticket_id ? 'Ticket #' + msg.ticket_id : ''}`)
              }
            } catch (e) {
              // ignore
            }
          }
          ws.onclose = () => { wsRef.current = null }
          wsRef.current = ws
        } catch (e) {
          // fallback to polling
        }
      }

      try {
        const data = await obtenerMisTareas(user.id)
        const list = Array.isArray(data) ? data : []
        const ids = list.map((t: any) => t.id)
        const newIds = ids.filter((id: number) => !prevIds.includes(id))
        if (newIds.length > 0 && mounted) {
          setCount(ids.length)
          const newest = list.find((t: any) => t.id === newIds[0])
          setLatest(`Ticket #${newest?.ticket_id} asignado`)
          toast(`Nueva tarea asignada: Ticket #${newest?.ticket_id}`)
        } else if (mounted) {
          setCount(ids.length)
        }
        prevIds = ids
      } catch (e) {
        // ignore
      }
    }

    poll()
    const iv = setInterval(poll, 15000)
    return () => {
      mounted = false
      clearInterval(iv)
      try { if (wsRef.current) wsRef.current.close() } catch(e){}
    }
  }, [])

  const user = getCurrentUser()

  return (
    <div className="flex items-center justify-between rounded-b-lg border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <Bell className="size-5 text-[#2d7a4f]" />
        <div>
          <div className="text-sm font-medium">Notificaciones</div>
          <div className="text-xs text-gray-500">{latest || 'Sin notificaciones recientes'}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="rounded-full bg-[#ffd54f] px-3 py-1 font-semibold text-[#1a4d2e]">
          {count}
        </div>
        <div className="text-sm text-[#2d7a4f]">{user?.username || 'Invitado'}</div>
      </div>
    </div>
  )
}
