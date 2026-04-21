import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatUser } from '@/lib/api'
import { getChatUsers, getCurrentUser, getInternalMessages, getNotificationsSocketUrl, sendInternalMessage } from '@/lib/api'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'

function playIncomingTone() {
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const audioCtx = new AudioCtx()
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.value = 900
    gainNode.gain.value = 0.001

    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)

    const now = audioCtx.currentTime
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    oscillator.start(now)
    oscillator.stop(now + 0.22)
  } catch {
    // The browser may block autoplay audio until user interaction.
  }
}

export function InternalChatPanel() {
  const currentUser = getCurrentUser()
  const currentUserId = Number(currentUser?.id || 0)
  const currentUsername = String(currentUser?.username || '').toLowerCase()
  const [users, setUsers] = useState<ChatUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'OLDER'>('ALL')
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  )

  useEffect(() => {
    let mounted = true
    setLoadingUsers(true)

    getChatUsers()
      .then((list) => {
        if (!mounted) return
        setUsers(list)
        if (list.length > 0) setSelectedUserId(list[0].id)
      })
      .catch((error) => {
        if (!mounted) return
        toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios')
      })
      .finally(() => {
        if (!mounted) return
        setLoadingUsers(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const userId = currentUserId
    if (!userId) return

    const socket = new WebSocket(getNotificationsSocketUrl(userId))
    wsRef.current = socket

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data?.type !== 'internal_message') return
        const payload = data.payload as ChatMessage

        const senderId = Number(payload.sender)
        const recipientId = Number(payload.recipient)
        const peerId = senderId === userId ? recipientId : senderId
        if (selectedUserId && peerId !== selectedUserId) {
          return
        }

        setMessages((prev) => {
          if (prev.some((item) => item.id === payload.id)) return prev
          return [...prev, payload]
        })

        if (senderId !== userId) {
          playIncomingTone()
        }
      } catch {
        // Ignore malformed message payloads.
      }
    }

    return () => {
      socket.close()
      if (wsRef.current === socket) wsRef.current = null
    }
  }, [currentUserId, selectedUserId])

  useEffect(() => {
    if (!selectedUserId) {
      setMessages([])
      return
    }

    let mounted = true
    setLoadingMessages(true)

    getInternalMessages(selectedUserId)
      .then((list) => {
        if (!mounted) return
        setMessages(list)
      })
      .catch((error) => {
        if (!mounted) return
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar el historial de chat')
      })
      .finally(() => {
        if (!mounted) return
        setLoadingMessages(false)
      })

    return () => {
      mounted = false
    }
  }, [selectedUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toDateKey = (value: string) => {
    const date = new Date(value)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const todayKey = toDateKey(new Date().toISOString())
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = toDateKey(yesterdayDate.toISOString())

  const getDayLabel = (dateKey: string) => {
    if (dateKey === todayKey) return 'Hoy'
    if (dateKey === yesterdayKey) return 'Ayer'
    return new Date(`${dateKey}T00:00:00`).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const visibleMessages = messages.filter((msg) => {
    const dayKey = toDateKey(msg.created_at)
    if (dateFilter === 'TODAY') return dayKey === todayKey
    if (dateFilter === 'YESTERDAY') return dayKey === yesterdayKey
    if (dateFilter === 'OLDER') return dayKey !== todayKey && dayKey !== yesterdayKey
    return true
  })

  const handleSend = async () => {
    const text = messageText.trim()
    if (!text || !selectedUserId) return

    const optimisticId = -Date.now()
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      sender: currentUserId,
      sender_name: currentUser?.fullName || currentUser?.username || 'Tú',
      sender_username: currentUser?.username || 'tu-usuario',
      recipient: selectedUserId,
      recipient_name: selectedUser?.full_name || selectedUser?.username || 'Usuario',
      recipient_username: selectedUser?.username || 'usuario',
      message: text,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setMessageText('')

    setSending(true)
    try {
      const created = await sendInternalMessage(selectedUserId, text)
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticId)
        if (withoutOptimistic.some((item) => item.id === created.id)) return withoutOptimistic
        return [...withoutOptimistic, created]
      })
    } catch (error) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      setMessageText(text)
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-3 md:gap-4 md:grid-cols-[300px_1fr]">
      <div className="digital-card rounded-2xl p-4">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#9adce1] bg-[#ebffff] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#106d73]">
          <MessageSquare className="size-3" /> Chat interno
        </p>
        <h3 className="mt-2 text-lg font-black text-[#124b4f]">Usuarios conectables</h3>
        <p className="text-xs text-[#2b7478]">Selecciona la persona con la que quieres hablar.</p>

        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1 md:max-h-[520px]">
          {loadingUsers && (
            <div className="flex items-center justify-center rounded-lg border border-[#cdebed] bg-[#f8ffff] p-3">
              <Loader2 className="size-5 animate-spin text-[#17828a]" />
            </div>
          )}

          {!loadingUsers && users.length === 0 && (
            <p className="rounded-lg border border-[#cdebed] bg-[#f8ffff] p-3 text-sm text-[#2d7478]">
              No hay usuarios disponibles para chat.
            </p>
          )}

          {users.map((user) => {
            const selected = user.id === selectedUserId
            return (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? 'border-[#73d3da] bg-[#e9feff] shadow-[0_8px_20px_rgba(20,158,164,0.15)]'
                    : 'border-[#d2ecee] bg-white hover:border-[#9adce1]'
                }`}
              >
                <p className="text-sm font-bold text-[#124b4f]">{user.full_name || user.username}</p>
                <p className="text-xs text-[#356f74]">{user.is_staff ? 'Administrador' : 'Técnico'} · @{user.username}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="digital-card rounded-2xl p-4">
        {!selectedUserId ? (
          <div className="flex h-[420px] items-center justify-center rounded-xl border border-[#cae9eb] bg-[#fbffff] text-[#2d7478]">
            Selecciona un usuario para comenzar el chat.
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#124b4f]">
                Conversación con {selectedUser?.full_name || selectedUser?.username}
              </h3>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'ALL' | 'TODAY' | 'YESTERDAY' | 'OLDER')}
                className="rounded-lg border border-[#9adce1] bg-white px-2 py-1 text-xs font-semibold text-[#1f5d63]"
              >
                <option value="ALL">Todos</option>
                <option value="TODAY">Hoy</option>
                <option value="YESTERDAY">Ayer</option>
                <option value="OLDER">Anteriores</option>
              </select>
            </div>

            <div className="h-[42vh] min-h-[250px] overflow-y-auto rounded-xl border border-[#cae9eb] bg-[#fbffff] p-3 md:h-[360px]">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-[#17828a]" />
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[#2d7478]">
                  No hay mensajes para este filtro.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleMessages.map((msg, index) => {
                    const currentDayKey = toDateKey(msg.created_at)
                    const previousDayKey = index > 0 ? toDateKey(visibleMessages[index - 1].created_at) : null
                    const mine = Number(msg.sender) === currentUserId || String(msg.sender_username || '').toLowerCase() === currentUsername
                    return (
                      <div key={msg.id}>
                        {currentDayKey !== previousDayKey && (
                          <div className="my-2 flex justify-center">
                            <span className="rounded-full border border-[#bfe7ea] bg-[#f2feff] px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#1f6d73]">
                              {getDayLabel(currentDayKey)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-xl border px-3 py-2 ${mine ? 'border-[#9fe1a4] bg-[#effff0]' : 'border-[#c9dcff] bg-[#f2f7ff]'}`}>
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#2f6278]">{msg.sender_name || msg.sender_username}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-[#1f4458]">{msg.message}</p>
                            <p className="mt-1 text-[11px] text-[#6a8291]">{new Date(msg.created_at).toLocaleString('es-CO')}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder="Escribe un mensaje..."
                className="min-w-0 flex-1 rounded-xl border border-[#9adce1] bg-white px-3 py-2 text-[#123f43] outline-none focus:border-[#3db9c1]"
                maxLength={2000}
                disabled={sending}
              />
              <button
                onClick={() => void handleSend()}
                disabled={sending}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#80d4d9] bg-[linear-gradient(145deg,#17bac3_0%,#79de73_100%)] px-3 py-2 text-sm font-semibold text-[#083f43] shadow-[0_8px_20px_rgba(20,158,164,0.2)] transition hover:brightness-105 disabled:opacity-60 md:px-4"
              >
                <Send className="size-4" /> Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
