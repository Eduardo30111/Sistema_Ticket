import { useEffect, useRef, useState } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { getCurrentUser, getCurrentUserDisplayName, getInternalMessageInbox, getNotificationsSocketUrl } from '@/lib/api';
import { obtenerMisTareas } from '@/lib/tareas';

function getReadNotificationsKey(userId?: number) {
  return userId ? `ticket_read_notifications_${userId}` : 'ticket_read_notifications_guest';
}

function getReadNotificationIds(userId?: number): string[] {
  try {
    const saved = localStorage.getItem(getReadNotificationsKey(userId));
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value));
  } catch {
    return [];
  }
}

function saveReadNotificationIds(userId: number | undefined, ids: string[]) {
  localStorage.setItem(getReadNotificationsKey(userId), JSON.stringify(ids));
}

function playIncomingTone() {
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = 920;
    gainNode.gain.value = 0.001;

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  } catch {
    // Ignore browsers blocking autoplay audio.
  }
}

interface Notificacion {
  id: string;
  tipo: 'tarea' | 'chat';
  titulo: string;
  mensaje: string;
  observaciones: string;
  leida: boolean;
  fecha_creacion: string;
  tareaId?: number;
}

interface TareaAsignada {
  id: number;
  ticket_id: number;
  usuario_asignado: number;
  usuario_nombre: string;
  asignado_por: string;
  estado: string;
  fecha_asignacion: string;
  descripcion: string;
  equipo_tipo: string;
  equipo_serie: string;
  observaciones: string;
}

interface NotificationBarProps {
  onNotificationClick?: (tareaId: number) => void;
  onChatNotificationClick?: () => void;
}

type CurrentUser = ReturnType<typeof getCurrentUser>;

export function NotificationBar({ onNotificationClick, onChatNotificationClick }: NotificationBarProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser>(() => getCurrentUser());
  const panelRef = useRef<HTMLDivElement>(null);
  const userDisplayName = getCurrentUserDisplayName() || user?.username || 'Invitado';

  useEffect(() => {
    const syncUser = () => setUser(getCurrentUser());
    syncUser();
    window.addEventListener('focus', syncUser);
    return () => window.removeEventListener('focus', syncUser);
  }, []);

  async function fetchNotificaciones(usuarioId?: number) {
    if (!usuarioId) return;
    try {
      const tareas = await obtenerMisTareas(usuarioId);
      const readIds = getReadNotificationIds(usuarioId);
      const mapped: Notificacion[] = tareas.map((t: TareaAsignada) => ({
        id: `tarea-${t.id}`,
        tipo: 'tarea',
        titulo: `Ticket #${t.ticket_id} asignado`,
        mensaje: `${t.asignado_por} te asignó el ticket #${t.ticket_id} — ${t.equipo_tipo} (${t.equipo_serie})`,
        observaciones: t.observaciones || '',
        leida: t.estado !== 'PENDIENTE' || readIds.includes(`tarea-${t.id}`),
        fecha_creacion: t.fecha_asignacion,
        tareaId: t.id,
      }));

      let chatFromApi: Notificacion[] = [];
      try {
        const inbox = await getInternalMessageInbox();
        chatFromApi = inbox.map((m) => ({
          id: `chat-${m.id}`,
          tipo: 'chat' as const,
          titulo: `Mensaje de ${m.sender_name || m.sender_username || 'usuario'}`,
          mensaje: m.message || 'Nuevo mensaje interno',
          observaciones: '',
          leida: readIds.includes(`chat-${m.id}`),
          fecha_creacion: m.created_at,
        }));
      } catch {
        // Sin sesión API o error de red: se mantienen solo tareas + chats ya en memoria (p. ej. por WS).
      }

      setNotificaciones((prev) => {
        const fromWsOnly = prev.filter(
          (n) => n.tipo === 'chat' && !chatFromApi.some((c) => c.id === n.id),
        );
        const chatById = new Map<string, Notificacion>();
        for (const c of [...chatFromApi, ...fromWsOnly]) {
          chatById.set(c.id, c);
        }
        return [...mapped, ...chatById.values()].sort(
          (a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime(),
        );
      });
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
    }
  }

  useEffect(() => {
    if (!user?.id) return;

    const timeout = setTimeout(() => {
      void fetchNotificaciones(user.id ?? undefined);
    }, 0);

    const interval = setInterval(() => {
      void fetchNotificaciones(user.id ?? undefined);
    }, 30000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const ws = new WebSocket(getNotificationsSocketUrl(Number(user.id)));

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'ticket_demora_solicitante') {
          const m = data.message || {};
          const tid = m.ticket_id ?? m.ticketId;
          const id = `demora-${tid}-${Date.now()}`;
          const incoming: Notificacion = {
            id,
            tipo: 'tarea',
            titulo: tid ? `Ticket #${tid} — demora` : 'Ticket — demora solicitada',
            mensaje: (m.text as string) || 'Un solicitante pidió atención por demora (sin técnico asignado).',
            observaciones: [m.equipo_tipo, m.equipo_serie].filter(Boolean).join(' · '),
            leida: false,
            fecha_creacion: new Date().toISOString(),
          };
          setNotificaciones((prev) => [incoming, ...prev]);
          playIncomingTone();
          return;
        }
        if (data?.type !== 'internal_message') return;

        const payload = data.payload || {};
        const me = Number(user.id);
        const recipientId = Number(payload.recipient);
        const senderId = Number(payload.sender);
        if (!me || recipientId !== me) return;
        if (senderId === me) return;

        const id = `chat-${payload.id}`;
        const readIds = getReadNotificationIds(user.id ?? undefined);

        const incoming: Notificacion = {
          id,
          tipo: 'chat',
          titulo: `Mensaje de ${payload.sender_name || payload.sender_username || 'usuario'}`,
          mensaje: payload.message || 'Nuevo mensaje interno',
          observaciones: '',
          leida: readIds.includes(id),
          fecha_creacion: payload.created_at || new Date().toISOString(),
        };

        setNotificaciones((prev) => {
          if (prev.some((n) => n.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        playIncomingTone();
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return () => {
      ws.close();
    };
  }, [user?.id, user?.username]);

  // Cerrar al hacer click fuera del panel
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAsRead = (id: string) => {
    saveReadNotificationIds(
      user?.id,
      Array.from(new Set([...getReadNotificationIds(user?.id), id]))
    );

    setNotificaciones(prev =>
      prev.map(n => n.id === id ? { ...n, leida: true } : n)
    );
  };

  const unreadCount = notificaciones.filter((n) => !n.leida).length;

  return (
    <div className="relative z-[100] flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/90 bg-white/95 px-3 py-3 backdrop-blur-sm sm:px-4">
      {/* Sección izquierda: campana + label */}
      <div className="flex items-center gap-3">
        <div ref={panelRef} className="relative">
          <button
            onClick={() => setIsOpen(prev => !prev)}
            className="relative flex items-center justify-center rounded-full p-1 hover:bg-gray-100"
            aria-label="Notificaciones"
          >
            <Bell className="size-5 text-[#2d7a4f]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* ── Bandeja de entrada ── */}
          {isOpen && (
            <div className="absolute left-0 top-full z-[110] mt-2 w-[min(20rem,calc(100vw-1.25rem))] max-w-[calc(100vw-1.25rem)] rounded-xl border border-gray-200 bg-white shadow-xl sm:w-80">
              {/* Cabecera */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="font-semibold text-gray-800">Bandeja de entrada</span>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Lista */}
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                {notificaciones.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">Sin notificaciones</p>
                ) : (
                  notificaciones.map(notif => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                        !notif.leida ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        if (!notif.leida) markAsRead(notif.id);
                        if (notif.tipo === 'tarea' && notif.tareaId && onNotificationClick) {
                          onNotificationClick(notif.tareaId);
                        }
                        if (notif.tipo === 'chat' && onChatNotificationClick) {
                          onChatNotificationClick();
                        }
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {notif.titulo}
                          </p>
                          <p className="mt-0.5 text-sm text-gray-700">{notif.mensaje}</p>
                          {notif.observaciones && (
                            <p className="mt-1 text-xs text-gray-500 italic">📝 {notif.observaciones}</p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(notif.fecha_creacion).toLocaleString('es-CO')}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          {!notif.leida && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                          <button
                            onClick={e => { e.stopPropagation(); markAsRead(notif.id); }}
                            title="Marcar como leída"
                            className="text-gray-300 hover:text-green-600"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-800">Notificaciones</p>
          <p className="text-xs text-gray-500">
            {unreadCount > 0 ? `${unreadCount} sin leer` : 'Al día'}
          </p>
        </div>
      </div>

      {/* Sección derecha: usuario */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span className="rounded-full bg-[#ffd54f] px-3 py-1 text-sm font-semibold text-[#1a4d2e]">
          {notificaciones.length}
        </span>
        <span className="max-w-[42vw] truncate text-sm text-[#2d7a4f] sm:max-w-none">{userDisplayName}</span>
      </div>
    </div>
  );
}

