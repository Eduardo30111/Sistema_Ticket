from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.conf import settings
from django.conf.urls.static import static
from api.admin_views import admin_chat_session, estadisticas_admin, ticket_chat_admin, ticket_chat_embed
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path('admin/estadisticas/', admin.site.admin_view(estadisticas_admin), name='admin-estadisticas'),
    path('admin/chat/', admin.site.admin_view(ticket_chat_admin), name='admin-ticket-chat'),
    path('admin/chat/embed/', admin.site.admin_view(ticket_chat_embed), name='admin-ticket-chat-embed'),
    path('admin/chat/session/', admin.site.admin_view(admin_chat_session), name='admin-ticket-chat-session'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/inventario/', include('inventario.urls')),
    path('api/mantenimiento/', include('mantenimiento.urls')),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
