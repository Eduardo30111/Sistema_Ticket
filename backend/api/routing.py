from django.urls import re_path
from .consumers import NotificationConsumer, TicketChatConsumer

websocket_urlpatterns = [
    re_path(r'ws/notifications/(?P<user_id>[^/]+)/$', NotificationConsumer.as_asgi()),
    re_path(r'ws/chat/ticket/(?P<ticket_id>[^/]+)/$', TicketChatConsumer.as_asgi()),
]
