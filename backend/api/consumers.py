from channels.generic.websocket import AsyncWebsocketConsumer
import json
import logging

logger = logging.getLogger(__name__)

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
