"""
Django settings for backend project.
"""

from pathlib import Path
import os
from datetime import timedelta
from urllib.parse import urlsplit
from django.contrib.auth.apps import AuthConfig

# ===============================
# BASE
# ===============================
BASE_DIR = Path(__file__).resolve().parent.parent

# ===============================
# SECURITY
# ===============================
DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-key-123456789'
    else:
        raise RuntimeError('SECRET_KEY must be set when DEBUG=False')

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        'ALLOWED_HOSTS',
        'localhost,127.0.0.1,192.168.80.19'
    ).split(',')
    if host.strip()
]

# HTTPS Security Settings
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_HTTPONLY = True

# ===============================
# APPLICATIONS
# ===============================
INSTALLED_APPS = [
    "jazzmin",
    'channels',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',
    'django_ratelimit',
    'drf_spectacular',

    # Local
    'api.apps.ApiConfig',
    'otros.apps.OtrosConfig',
    'inventario.apps.InventarioConfig',
    'mantenimiento.apps.MantenimientoConfig',
]

# Cambia el nombre del bloque de autenticacion en el admin.
AuthConfig.verbose_name = 'Usuarios y permisos'

# ===============================
# MIDDLEWARE
# ===============================
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ===============================
# URLS / WSGI
# ===============================
ROOT_URLCONF = 'backend.urls'
ASGI_APPLICATION = 'backend.asgi.application'
WSGI_APPLICATION = 'backend.wsgi.application'

# ===============================
# TEMPLATES
# ===============================
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ===============================
# DATABASE
# ===============================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
# Producción: Postgres (p. ej. Neon) vía DATABASE_URL
if os.environ.get('DATABASE_URL'):
    import dj_database_url

    # Neon/serverless: conexiones largas en el pool suelen quedar rotas → 500 en la API
    # mientras el admin (sin tocar ORM) sigue respondiendo. Por defecto: sin persistencia.
    # Para Postgres clásico: DATABASE_CONN_MAX_AGE=600 (y opcional CONN_HEALTH_CHECKS abajo).
    _db_conn_max_age = int(os.environ.get('DATABASE_CONN_MAX_AGE', '0'))
    DATABASES['default'] = dj_database_url.config(
        conn_max_age=_db_conn_max_age,
        ssl_require=True,
    )
    if _db_conn_max_age > 0:
        DATABASES['default']['CONN_HEALTH_CHECKS'] = True

# ===============================
# PASSWORD VALIDATION
# ===============================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ===============================
# INTERNATIONALIZATION
# ===============================
LANGUAGE_CODE = 'es-co'
TIME_ZONE = 'America/Bogota'
USE_I18N = True
USE_TZ = True

# ===============================
# STATIC FILES (ADMIN FIX)
# ===============================
STATIC_URL = '/static/'

# Channels (WebSocket). Si no hay REDIS_URL, usar memoria para no romper el arranque.
_redis_url = (os.environ.get('REDIS_URL') or '').strip()
_use_redis_channels = os.environ.get('USE_REDIS_CHANNELS', '').lower() in ('1', 'true', 'yes')
if (DEBUG and not _use_redis_channels) or (not _redis_url and not _use_redis_channels):
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
else:
    if _redis_url:
        _hosts = [_redis_url]
    else:
        _hosts = [(os.environ.get('REDIS_HOST', '127.0.0.1'), int(os.environ.get('REDIS_PORT', 6379)))]
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': _hosts},
        },
    }

# Cache configuration for rate limiting (DRF throttles, django-ratelimit).
# En desarrollo, LocMem evita depender de Redis.
#
# En producción: NO reutilizar automáticamente REDIS_URL (Channels/Upstash) como
# LOCATION de Django RedisCache. Upstash/TLS o el cliente de caché pueden fallar
# y provocar HTTP 500 en *toda* la API DRF al evaluar throttles en cada request.
# Para caché compartida entre workers, define REDIS_CACHE_LOCATION (o REDIS_CACHE_URL)
# con una URL que Django RedisCache pueda usar de forma fiable.
_redis_cache_url = (os.environ.get('REDIS_CACHE_LOCATION') or os.environ.get('REDIS_CACHE_URL') or '').strip()
if DEBUG:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'sistema-tickets-dev-cache',
        }
    }
else:
    if _redis_cache_url:
        CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                'LOCATION': _redis_cache_url,
            }
        }
    else:
        CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': 'sistema-tickets-prod-cache',
            }
        }

# django-ratelimit E003: exige caché compartida; en Render solemos usar LocMem a propósito
# (sin REDIS_CACHE_*). E003 es error y hace fallar `migrate`/`collectstatic` en el build.
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.E003', 'django_ratelimit.W001']

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

STATIC_ROOT = BASE_DIR / "staticfiles"
if not DEBUG:
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Build del frontend (Vite): `cd frontend && npm run build` escribe aquí (ver vite.config.ts).
SPA_DIST_DIR = BASE_DIR / 'spa_dist'

# ===============================
# DEFAULT PK
# ===============================
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ===============================
# EMAIL
# ===============================
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

# ===============================
# CORS / CSRF
# ===============================
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    "http://192.168.80.19:5173",
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://192.168.80.19:5173',
]


def _normalize_origin(origin: str) -> str:
    """
    Normaliza origins para CORS/CSRF:
    - quita espacios
    - acepta entradas con path y las reduce a scheme://netloc
    - elimina slash final
    """
    raw = (origin or '').strip()
    if not raw:
        return ''
    parsed = urlsplit(raw)
    if parsed.scheme and parsed.netloc:
        return f'{parsed.scheme}://{parsed.netloc}'
    # fallback por si llega algo ya casi válido pero sin parse estricto
    return raw.rstrip('/')


for _origin in os.environ.get('CORS_EXTRA_ORIGINS', '').split(','):
    _o = _normalize_origin(_origin)
    if _o and _o not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_o)
    if _o and _o not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_o)

# ===============================
# REST FRAMEWORK / JWT
# ===============================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Sin throttles por defecto: usan la caché de Django y en Render/Upstash/Neon suelen ser
    # origen de 500 en toda la API. Los endpoints sensibles ya usan @ratelimit (django-ratelimit).
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
}

# ===============================
# DRF SPECTACULAR
# ===============================
SPECTACULAR_SETTINGS = {
    'TITLE': 'SistemaTickets API',
    'DESCRIPTION': 'API para el sistema de gestión de tickets',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# ===============================
# WHATSAPP BUSINESS
# ===============================
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', '')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
FRONTEND_PUBLIC_URL = os.environ.get('FRONTEND_PUBLIC_URL', 'http://192.168.80.19:5173').rstrip('/')

# ===============================
# JAZZMIN (Admin UI)
# ===============================
JAZZMIN_SETTINGS = {
    'site_title': 'Oficina TIC',
    'site_header': 'Oficina TIC — Admin',
    'site_brand': 'Oficina TIC',
    'welcome_sign': 'Bienvenido al panel de administración',
    'copyright': 'Oficina TIC — Universidad Unisalamanca',
    'site_logo': 'admin/img/robot_tic.png',
    'login_logo': 'admin/img/robot_tic.png',
    'login_logo_dark': 'admin/img/robot_tic.png',
    'site_logo_classes': 'img-circle elevation-3',
    'custom_css': 'admin/css/admin_digital.css',
    'custom_js': 'admin/js/chat_bubble.js',
    'navigation_expanded': False,
    'order_with_respect_to': [
        'api',
        'api.oficina',
        'api.oficinaequipo',
        'api.persona',
        'api.solicitudreactivacioncontratista',
        'inventario',
        'inventario.stockinventario',
        'inventario.salidainventario',
        'otros',
        'otros.equipootros',
        'otros.ticketotros',
        'otros.asignaciontareaotros',
        'sugerencias',
        'auth',
        'auth.user',
    ],
    'custom_links': {
        'otros': [
            {
                'model': 'api.mascotafeedback',
            },
        ],
    },
    'hide_models': [
        'inventario.ingresoinventario',
        'api.equipo',
        'api.ticket',
        'api.asignaciontarea',
        'api.mascotafeedback',
        'api.inventarioplaceholder',
        'api.mantenimientoplaceholder',
        'api.funcionariopersona',
        'api.contratistapersona',
        'auth.group',
    ],
    'icons': {
        'inventario': 'fas fa-tools',
        'inventario.stockinventario': 'fas fa-warehouse',
        'inventario.salidainventario': 'fas fa-truck-ramp-box',
        'otros': 'fas fa-binoculars',
        'otros.equipootros': 'fas fa-desktop',
        'otros.ticketotros': 'fas fa-ticket-alt',
        'otros.asignaciontareaotros': 'fas fa-tasks',
        'api.mascotafeedback': 'fas fa-lightbulb',
        'auth': 'fas fa-users-cog',
        'auth.user': 'fas fa-user',
        'auth.Group': 'fas fa-users',
        'api.ticket': 'fas fa-ticket-alt',
        'api.asignaciontarea': 'fas fa-tasks',
        'api.oficina': 'fas fa-building',
        'api.persona': 'fas fa-id-badge',
        'api.oficinaequipo': 'fas fa-boxes-stacked',
        'api.solicitudreactivacioncontratista': 'fas fa-unlock-keyhole',
        'api.equipo': 'fas fa-desktop',
        'api.inventarioplaceholder': 'fas fa-boxes-stacked',
        'api.mantenimientoplaceholder': 'fas fa-screwdriver-wrench',
    },
    'default_icon_parents': 'fas fa-chevron-circle-right',
    'default_icon_children': 'fas fa-circle',
}
