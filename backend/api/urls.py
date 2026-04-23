from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import AsignacionTareaViewSet, TicketMessageViewSet, InternalMessageViewSet

from .views import (
    EquipoViewSet,
    OficinaViewSet,
    PersonaViewSet,
    OficinaEquipoViewSet,
    SolicitudReactivacionContratistaViewSet,
    TicketViewSet,
    AsignacionTareaViewSet,
    auth_login,
    solicitar,
    mascota_feedback,
    solicitar_reactivacion_contratista,
    verificar_estado_persona,
    revisar_ticket_publico,
    solicitar_demora_ticket_publico,
    stats,
    chat_users,
    diagnostico,
    oficinas_publicas,
    oficina_catalogo,
    oficina_qr_descargar,
    oficina_sticker_descargar,
    whatsapp_webhook,
)

router = DefaultRouter()
router.register(r'oficinas', OficinaViewSet)
router.register(r'funcionarios', PersonaViewSet, basename='funcionarios')
router.register(r'personas', PersonaViewSet, basename='personas-legacy')
router.register(r'inventario-oficina', OficinaEquipoViewSet)
router.register(r'reactivacion-contratistas', SolicitudReactivacionContratistaViewSet)
router.register(r'equipos', EquipoViewSet)
router.register(r'tickets', TicketViewSet)
router.register(r'tareas', AsignacionTareaViewSet, basename='tareas')
router.register(r'ticket-messages', TicketMessageViewSet, basename='ticket-messages')
router.register(r'internal-messages', InternalMessageViewSet, basename='internal-messages')

urlpatterns = router.urls + [
    path('stats/', stats, name='api-stats'),
    path('chat-users/', chat_users, name='api-chat-users'),
    path('oficinas-publicas/', oficinas_publicas, name='api-oficinas-publicas'),
    path('oficina-catalogo/', oficina_catalogo, name='api-oficina-catalogo'),
    path('oficinas/<int:oficina_id>/qr-descargar/', oficina_qr_descargar, name='api-oficina-qr-descargar'),
    path('oficinas/<int:oficina_id>/sticker-descargar/', oficina_sticker_descargar, name='api-oficina-sticker-descargar'),
    path('solicitar-ticket/', solicitar, name='api-solicitar'),
    path('mascota-feedback/', mascota_feedback, name='api-mascota-feedback'),
    path('solicitar-reactivacion-contratista/', solicitar_reactivacion_contratista, name='api-reactivar-contratista'),
    path('verificar-estado-persona/', verificar_estado_persona, name='api-verificar-estado-persona'),
    path('revisar-ticket/', revisar_ticket_publico, name='api-revisar-ticket-publico'),
    path('ticket-demora-publico/', solicitar_demora_ticket_publico, name='api-ticket-demora-publico'),
    path('auth/login/', auth_login, name='api-auth-login'),
    path('diagnostico/', diagnostico, name='api-diagnostico'),
    path('whatsapp/webhook/', whatsapp_webhook, name='api-whatsapp-webhook'),
]
