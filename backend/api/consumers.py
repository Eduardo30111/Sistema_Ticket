from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
import json
import logging
from urllib.parse import parse_qs

from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Ticket, AsignacionTarea, TicketMessage

logger = logging.getLogger(__name__)

User = get_user_model()

class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # url path: /ws/notifications/<user_id>/
        self.user_id = self.scope['url_route']['kwargs'].get('user_id')
        if not self.user_id:
            await self.close()
            return
        self.group_name = f'user_{self.user_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        try:
            logger.info(f"WS connect: user_id={self.user_id} group={self.group_name} channel={self.channel_name}")
        except Exception:
            pass

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass
        try:
            logger.info(f"WS disconnect: user_id={getattr(self, 'user_id', None)} code={close_code}")
        except Exception:
            pass

    async def receive(self, text_data=None, bytes_data=None):
        # Echo or ignore
        pass

    async def task_assigned(self, event):
        # event expected to have 'message' key
        message = event.get('message')
        try:
            logger.info(f"WS send to {getattr(self, 'group_name', None)} message={message}")
        except Exception:
            pass
        await self.send(json.dumps({
            'type': 'task_assigned',
            'message': message
        }))

    async def internal_message(self, event):
        payload = event.get('payload') or {}
        await self.send(json.dumps({
            'type': 'internal_message',
            'payload': payload,
        }))

    async def ticket_demora_solicitante(self, event):
        await self.send(json.dumps({
            'type': 'ticket_demora_solicitante',
            'message': event.get('message') or {},
        }))


class TicketChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.ticket_id = self.scope['url_route']['kwargs'].get('ticket_id')
        if not self.ticket_id:
            await self.close(code=4001)
            return

        self.user = self.scope.get('user')
        if not self.user or isinstance(self.user, AnonymousUser) or not self.user.is_authenticated:
            token = self._extract_token_from_query()
            self.user = await self._user_from_token(token)

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4003)
            return

        has_permission = await self._user_can_access_ticket(self.user.id, self.ticket_id)
        if not has_permission:
            await self.close(code=4003)
            return

        self.group_name = f'ticket_chat_{self.ticket_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            try:
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
            except Exception:
                pass

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except Exception:
            return

        message = str(payload.get('message', '')).strip()
        if not message:
            return

        if len(message) > 2000:
            await self.send(json.dumps({'type': 'error', 'message': 'Mensaje demasiado largo (máximo 2000 caracteres).'}))
            return

        chat_message = await self._create_chat_message(self.ticket_id, self.user.id, message)
        if not chat_message:
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat_message',
                'payload': chat_message,
            },
        )

    async def chat_message(self, event):
        await self.send(json.dumps({
            'type': 'chat_message',
            'payload': event.get('payload', {}),
        }))

    def _extract_token_from_query(self):
        try:
            query = parse_qs(self.scope.get('query_string', b'').decode())
        except Exception:
            return None
        token_values = query.get('token') or []
        if not token_values:
            return None
        return token_values[0]

    @database_sync_to_async
    def _user_from_token(self, raw_token):
        if not raw_token:
            return AnonymousUser()
        try:
            auth = JWTAuthentication()
            validated_token = auth.get_validated_token(raw_token)
            return auth.get_user(validated_token)
        except Exception:
            return AnonymousUser()

    @database_sync_to_async
    def _user_can_access_ticket(self, user_id, ticket_id):
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if not user:
            return False

        ticket = Ticket.objects.filter(pk=ticket_id).first()
        if not ticket:
            return False

        if user.is_staff or user.is_superuser:
            return True

        return AsignacionTarea.objects.filter(ticket=ticket, usuario_asignado=user).exists()

    @database_sync_to_async
    def _create_chat_message(self, ticket_id, user_id, message):
        user = User.objects.filter(pk=user_id).first()
        ticket = Ticket.objects.filter(pk=ticket_id).first()
        if not user or not ticket:
            return None

        chat_message = TicketMessage.objects.create(
            ticket=ticket,
            sender=user,
            message=message,
        )

        try:
            from .notifications import notify_ticket_chat_message

            notify_ticket_chat_message(ticket, user, message)
        except Exception:
            logger.warning('No se pudo enviar correo por mensaje de chat ticket %s', ticket_id, exc_info=True)

        return {
            'id': chat_message.id,
            'ticket': chat_message.ticket_id,
            'sender': chat_message.sender_id,
            'sender_name': user.get_full_name() or user.username,
            'sender_username': user.username,
            'message': chat_message.message,
            'created_at': chat_message.created_at.isoformat(),
        }
