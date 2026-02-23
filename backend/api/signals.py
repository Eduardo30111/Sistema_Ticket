from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Ticket
from .utils import enviar_correo_ticket
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Ticket)
def notificar_ticket_creado(sender, instance, created, **kwargs):
    if created:
        enviar_correo_ticket(
            asunto='📩 Nuevo ticket creado',
            mensaje=(
                f'Se ha creado un nuevo ticket\n\n'
                f'ID: {instance.id}\n'
                f'Estado: {instance.estado}\n'
                f'Descripción:\n{instance.descripcion}'
            ),
            destinatarios=['j20585489@gmail.com']
        )

# Notificar también cuando se cree una AsignacionTarea (por admin o API)
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import AsignacionTarea


@receiver(post_save, sender=AsignacionTarea)
def notificar_asignacion_tarea(sender, instance, created, **kwargs):
    if not created:
        return
    # Enviar mensaje por channels
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from django.contrib.auth import get_user_model

        channel_layer = get_channel_layer()
        group = f'user_{instance.usuario_asignado_id}'
        message = {
            'message': f'Te ha sido asignado el ticket #{instance.ticket_id}',
            'tarea_id': instance.id,
            'ticket_id': instance.ticket_id,
        }
        async_to_sync(channel_layer.group_send)(group, {
            'type': 'task_assigned',
            'message': message,
        })
        try:
            logger.info(f"Signal: asignacion id={instance.id} notify group={group}")
        except Exception:
            pass

        # intentar mapear al auth.User por correo/nombre y notificar también a su grupo
        try:
            User = get_user_model()
            usuario_model = instance.usuario_asignado
            if usuario_model:
                auth_user = None
                if usuario_model.correo:
                    auth_user = User.objects.filter(email=usuario_model.correo).first()
                if not auth_user:
                    auth_user = User.objects.filter(username=usuario_model.nombre).first()
                if auth_user:
                    auth_group = f'user_{auth_user.id}'
                    async_to_sync(channel_layer.group_send)(auth_group, {
                        'type': 'task_assigned',
                        'message': message,
                    })
                    try:
                        logger.info(f"Signal: also notifying auth.User id={auth_user.id} group={auth_group}")
                    except Exception:
                        pass
        except Exception:
            pass
    except Exception:
        pass

    # Enviar correo como fallback
    try:
        usuario = instance.usuario_asignado
        if usuario and usuario.correo:
            enviar_correo_ticket(
                asunto='🔔 Tarea asignada',
                mensaje=(
                    f'Hola {usuario.nombre},\n\nSe te ha asignado la siguiente tarea:\n'
                    f'Ticket: {instance.ticket.equipo.tipo} - {instance.ticket.equipo.serie}\n'
                    f'ID Tarea: {instance.id}\n\nPor favor revisa el sistema para más detalles.'
                ),
                destinatarios=[usuario.correo],
            )
    except Exception:
        pass
