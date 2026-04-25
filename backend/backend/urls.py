import os
from pathlib import Path

from django.contrib import admin
from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path, re_path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.conf.urls.static import static
from api.admin_views import admin_chat_session, estadisticas_admin, ticket_chat_admin, ticket_chat_embed
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView


def api__ping(request):
    """No toca BD ni DRF; útil para ver si el proceso web responde en Render."""
    return JsonResponse({'ok': True})


def healthz(request):
    """Raíz del sitio (no bajo /api/): evita 404 si el deploy aún no trae rutas bajo api/."""
    return JsonResponse({'ok': True, 'where': 'backend'})


def api__health(request):
    """Comprueba conexión a BD sin cargar api.urls (no importa api.views)."""
    from django.db import connection

    err = None
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        db_ok = True
    except Exception as exc:
        db_ok = False
        err = repr(exc)
    return JsonResponse(
        {
            'db_ok': db_ok,
            'db_error': err,
            'cache_backend': settings.CACHES['default']['BACKEND'],
        }
    )


def dev_root(request):
    """
    En DEBUG el SPA no se sirve desde Django; el front corre en Vite (puerto 5173).
    Evita confusión si alguien abre http://127.0.0.1:8080/ y ve solo 404.
    """
    from django.http import HttpResponse
    from django.shortcuts import redirect

    if request.GET.get('json') == '1':
        return JsonResponse(
            {
                'ok': True,
                'hint': 'En desarrollo abre el frontend en Vite, no la raíz del backend.',
                'frontend': os.environ.get('FRONTEND_DEV_URL', 'http://localhost:5173/'),
                'api': '/api/',
                'admin': '/admin/',
            }
        )

    target = os.environ.get('FRONTEND_DEV_URL', 'http://localhost:5173/').rstrip('/') + '/'
    if request.GET.get('stay') != '1':
        return redirect(target)

    html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Desarrollo — Sistema Tickets</title>
    <style>body{{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5}}
    a{{color:#166534}}</style></head><body>
    <h1>Backend en modo desarrollo</h1>
    <p>La interfaz web (React) no se sirve aquí. Ábrela en Vite:</p>
    <p><a href="{target}"><strong>{target}</strong></a></p>
    <p>Otras rutas útiles:</p>
    <ul>
      <li><a href="/admin/">Admin Django</a></li>
      <li><a href="/api/__ping/">API ping</a></li>
    </ul>
    <p><small>Sin <code>?stay=1</code> esta página te redirige al frontend.</small></p>
    </body></html>"""
    return HttpResponse(html)


urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('healthz', healthz, name='healthz-no-slash'),
    path('healthz/db/', api__health, name='healthz-db'),
    path('healthz/db', api__health, name='healthz-db-no-slash'),
    path('admin/estadisticas/', admin.site.admin_view(estadisticas_admin), name='admin-estadisticas'),
    path('admin/chat/', admin.site.admin_view(ticket_chat_admin), name='admin-ticket-chat'),
    path('admin/chat/embed/', admin.site.admin_view(ticket_chat_embed), name='admin-ticket-chat-embed'),
    path('admin/chat/session/', admin.site.admin_view(admin_chat_session), name='admin-ticket-chat-session'),
    path('admin/', admin.site.urls),
    path('api/__ping/', api__ping, name='api-internal-ping'),
    path('api/__ping', api__ping, name='api-internal-ping-no-slash'),
    path('api/__health/', api__health, name='api-internal-health'),
    path('api/__health', api__health, name='api-internal-health-no-slash'),
    path('api/', include('api.urls')),
    path('api/inventario/', include('inventario.urls')),
    path('api/mantenimiento/', include('mantenimiento.urls')),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

_spa_index = Path(settings.SPA_DIST_DIR) / 'index.html'
if not settings.DEBUG and _spa_index.is_file():
    from .spa_views import serve_spa_asset, serve_spa_index, serve_spa_root_file

    urlpatterns += [
        path('assets/<path:asset_path>', serve_spa_asset, name='spa-asset'),
        re_path(
            r'^(?P<name>favicon\.ico|vite\.svg|robots\.txt)$',
            serve_spa_root_file,
            name='spa-root-file',
        ),
        path('', serve_spa_index, name='spa-index'),
        path('<path:any_path>', serve_spa_index, name='spa-fallback'),
    ]

if settings.DEBUG:
    urlpatterns.insert(0, path('', dev_root, name='dev-root'))
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
