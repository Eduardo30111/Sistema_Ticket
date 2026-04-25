import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AsignacionTarea, Ticket
from .notifications import notify_new_ticket_to_team

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Ticket)
def notificar_equipo_ticket_nuevo(sender, instance, created, **kwargs):
    """Aviso por correo a la mesa técnica cuando entra un ticket nuevo (cualquier origen)."""
    if created:
        try:
            notify_new_ticket_to_team(instance)
        except Exception:
            logger.exception('Fallo notificando equipo por nuevo ticket #%s', instance.id)


@receiver(post_save, sender=AsignacionTarea)
def notificar_asignacion_tarea_ws(sender, instance, created, **kwargs):
    """Solo WebSocket: el correo de asignación lo envía `AsignacionTareaViewSet.perform_create` (User.email)."""
    if not created:
        return
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        group = f'user_{instance.usuario_asignado_id}'
        message = {
            'message': f'Te ha sido asignado el ticket #{instance.ticket_id}',
            'tarea_id': instance.id,
            'ticket_id': instance.ticket_id,
        }
        async_to_sync(channel_layer.group_send)(
            group,
            {
                'type': 'task_assigned',
                'message': message,
            },
        )
        try:
            logger.info('Signal: asignacion id=%s notify group=%s', instance.id, group)
        except Exception:
            pass
    except Exception:
        pass
