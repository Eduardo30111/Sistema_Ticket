# 🚀 GUÍA PRÁCTICA: COMANDOS ESPECÍFICOS PARA DEPLOYMENT

**Ingeniero de Sistemas Senior**  
**Fecha:** 20 de Abril de 2026  
**Objetivo:** Paso a paso para llevar a producción

---

## 🎯 FASE 1: PREPARACIÓN LOCAL (Tu PC - Ahora)

### **Paso 1: Crear archivo .env**

```bash
# En: backend/.env
DEBUG=False
SECRET_KEY=tu-clave-aleatoria-de-50-caracteres-aqui
ALLOWED_HOSTS=localhost,127.0.0.1,tu-dominio.com
DJANGO_SETTINGS_MODULE=backend.settings

# Base de datos (temporal, cambiarás después)
DB_ENGINE=django.db.backends.sqlite3
DB_NAME=db.sqlite3

# Email (Gmail app password)
EMAIL_HOST_USER=tu-email@gmail.com
EMAIL_HOST_PASSWORD=app-password-generada-en-google

# Redis (temporalmente local)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=tu-password-redis

# JWT
JWT_SECRET_KEY=otra-clave-aleatoria-de-50-caracteres
ACCESS_TOKEN_LIFETIME=15
REFRESH_TOKEN_LIFETIME=7

# URLs públicas
FRONTEND_PUBLIC_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:8000
```

### **Paso 2: Actualizar settings.py**

```python
# backend/backend/settings.py

import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ===== SECURITY =====
DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
SECRET_KEY = os.getenv('SECRET_KEY')

if not SECRET_KEY and not DEBUG:
    raise ValueError("SECRET_KEY must be set in .env for production")

ALLOWED_HOSTS = [
    h.strip() 
    for h in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
]

# HTTPS en producción
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_HTTPONLY = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# ===== DATABASE =====
DATABASES = {
    'default': {
        'ENGINE': os.getenv('DB_ENGINE', 'django.db.backends.sqlite3'),
        'NAME': os.getenv('DB_NAME', BASE_DIR / 'db.sqlite3'),
        'USER': os.getenv('DB_USER', ''),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', ''),
        'PORT': os.getenv('DB_PORT', ''),
        'ATOMIC_REQUESTS': True if not DEBUG else False,
        'CONN_MAX_AGE': 600 if not DEBUG else 0,
    }
}

# ===== EMAIL =====
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

# ===== JWT =====
from rest_framework_simplejwt.settings import SIMPLE_JWT

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_LIFETIME', 15))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('REFRESH_TOKEN_LIFETIME', 7))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': False,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
}

# ===== REDIS =====
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [(
                os.getenv('REDIS_HOST', '127.0.0.1'),
                int(os.getenv('REDIS_PORT', 6379))
            )],
            'password': os.getenv('REDIS_PASSWORD', ''),
        },
    },
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': f"redis://:{os.getenv('REDIS_PASSWORD', '')}@{os.getenv('REDIS_HOST', '127.0.0.1')}:{os.getenv('REDIS_PORT', 6379)}/1",
    }
}

# ===== CORS =====
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    os.getenv('FRONTEND_PUBLIC_URL', 'http://localhost:5173'),
]

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
```

### **Paso 3: Generar SECRET_KEY fuerte**

```bash
# En PowerShell o Bash:
# Option 1: Python
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Option 2: OpenSSL
openssl rand -base64 50

# Copiar la salida y pegar en .env como SECRET_KEY=...
```

### **Paso 4: Probar localmente**

```bash
cd backend

# Activar venv
. venv\Scripts\Activate.ps1  # Windows PowerShell
# or
source venv/bin/activate  # Linux/Mac

# Instalar dependencias
pip install -r requirements.txt

# Hacer migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superuser
python manage.py createsuperuser

# Cargar datos de prueba
python manage.py seed_data

# Runserver para probar
python manage.py runserver 0.0.0.0:8000

# En otra terminal, runserver frontend
cd ../frontend
npm run dev
```

---

## 🌐 FASE 2: PREPARAR SERVIDOR (VPS)

### **Paso 1: Conectar al VPS**

```bash
# SSH al servidor (ejemplo con Linode/DigitalOcean)
ssh root@tu-ip-publica

# Actualizar sistema
apt update && apt upgrade -y

# Instalar dependencias base
apt install -y python3 python3-pip python3-venv python3-dev
apt install -y postgresql postgresql-contrib
apt install -y redis-server
apt install -y nginx
apt install -y curl wget git
apt install -y build-essential libssl-dev libffi-dev

# Verificar versiones
python3 --version
psql --version
redis-cli --version
nginx -v
```

### **Paso 2: Crear usuario para la aplicación**

```bash
# Crear usuario sin acceso a shell
useradd -m -s /bin/false tickets

# Crear directorio de la app
mkdir -p /var/www/tickets
chown -R tickets:tickets /var/www/tickets

# Cambiar a usuario tickets
su - tickets

# Crear directorio de logs
mkdir -p /var/www/tickets/logs
```

### **Paso 3: Configurar PostgreSQL**

```bash
# Conectar como root
sudo -u postgres psql

# Dentro de psql:
CREATE USER tickets_user WITH PASSWORD 'password_muy_fuerte_aqui_cambiar';
CREATE DATABASE tickets_db OWNER tickets_user;

# Dar permisos
ALTER ROLE tickets_user SET client_encoding TO 'utf8';
ALTER ROLE tickets_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE tickets_user SET default_transaction_deferrable TO on;
ALTER ROLE tickets_user SET default_transaction_level TO 'read committed';

# Salir
\q
```

### **Paso 4: Configurar Redis**

```bash
# Editar configuración de Redis
sudo nano /etc/redis/redis.conf

# Buscar y cambiar:
# requirepass tu-password-redis-fuerte-aqui

# Habilitar persistencia (línea 263):
# save 900 1
# save 300 10
# save 60 10000

# Reiniciar
sudo systemctl restart redis-server
sudo systemctl status redis-server

# Probar conexión
redis-cli ping
# Debe retornar: PONG
```

---

## 📦 FASE 3: SUBIR Y CONFIGURAR CÓDIGO

### **Paso 1: Clonar repositorio**

```bash
# En /var/www/tickets (como usuario tickets)
cd /var/www/tickets

# Opción A: Clonar con Git
git clone https://github.com/tu-usuario/SistemaTickets.git .

# Opción B: Subir manual
# Comprimir en tu PC:
# zip -r SistemaTickets.zip . -x "*.git*" "node_modules/*" "venv/*" ".env" "db.sqlite3"
# Subir: scp SistemaTickets.zip root@ip:/var/www/tickets/
# En servidor: unzip SistemaTickets.zip
```

### **Paso 2: Crear .env en servidor**

```bash
# En /var/www/tickets/backend/.env

# settings
DEBUG=False
SECRET_KEY=tu-clave-generada-aqui-50-caracteres
ALLOWED_HOSTS=tu-dominio.com,www.tu-dominio.com

# Database PostgreSQL
DB_ENGINE=django.db.backends.postgresql
DB_NAME=tickets_db
DB_USER=tickets_user
DB_PASSWORD=password_muy_fuerte_aqui_cambiar
DB_HOST=localhost
DB_PORT=5432

# Email
EMAIL_HOST_USER=tu-email@gmail.com
EMAIL_HOST_PASSWORD=app-password-google

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=tu-password-redis-fuerte-aqui

# URLs
FRONTEND_PUBLIC_URL=https://tu-dominio.com
API_PUBLIC_URL=https://tu-dominio.com/api

# Permisos
chmod 600 /var/www/tickets/backend/.env
```

### **Paso 3: Instalar dependencias Python**

```bash
cd /var/www/tickets/backend

# Crear venv
python3 -m venv venv

# Activar
source venv/bin/activate

# Instalar
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn psycopg2-binary

# Instalar Channels extras
pip install channels-redis daphne
```

### **Paso 4: Migraciones en producción**

```bash
cd /var/www/tickets/backend
source venv/bin/activate

# Hacer migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superuser
python manage.py createsuperuser

# Recolectar estáticos
python manage.py collectstatic --noinput

# Crear datos de prueba (opcional)
python manage.py seed_data
```

### **Paso 5: Instalar dependencias Frontend**

```bash
cd /var/www/tickets/frontend

# Instalar Node si no está
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar dependencias
npm install

# Build para producción
npm run build

# Los archivos compilados están en: dist/
```

---

## 🔧 FASE 4: CONFIGURAR GUNICORN + NGINX

### **Paso 1: Crear servicio de Gunicorn**

```bash
# Archivo: /etc/systemd/system/gunicorn-tickets.service

[Unit]
Description=Gunicorn Tickets Django Application
After=network.target postgresql.service

[Service]
Type=notify
User=tickets
Group=tickets
WorkingDirectory=/var/www/tickets/backend
ExecStart=/var/www/tickets/backend/venv/bin/gunicorn \
    --workers 4 \
    --worker-class sync \
    --timeout 120 \
    --bind 127.0.0.1:8000 \
    --access-logfile /var/www/tickets/logs/gunicorn-access.log \
    --error-logfile /var/www/tickets/logs/gunicorn-error.log \
    backend.wsgi:application

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Hacer ejecutable
sudo systemctl daemon-reload
sudo systemctl enable gunicorn-tickets
sudo systemctl start gunicorn-tickets
sudo systemctl status gunicorn-tickets
```

### **Paso 2: Crear servicio de Daphne (WebSockets)**

```bash
# Archivo: /etc/systemd/system/daphne-tickets.service

[Unit]
Description=Daphne Tickets WebSocket Application
After=network.target

[Service]
Type=notify
User=tickets
Group=tickets
WorkingDirectory=/var/www/tickets/backend
ExecStart=/var/www/tickets/backend/venv/bin/daphne \
    --bind 127.0.0.1 \
    --port 8001 \
    --access-log /var/www/tickets/logs/daphne-access.log \
    backend.asgi:application

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable daphne-tickets
sudo systemctl start daphne-tickets
sudo systemctl status daphne-tickets
```

### **Paso 3: Configurar Nginx**

```nginx
# Archivo: /etc/nginx/sites-available/tickets

upstream gunicorn {
    server 127.0.0.1:8000;
}

upstream daphne {
    server 127.0.0.1:8001;
}

# Redirigir HTTP -> HTTPS
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name tu-dominio.com www.tu-dominio.com;

    # SSL
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logs
    access_log /var/www/tickets/logs/nginx-access.log;
    error_log /var/www/tickets/logs/nginx-error.log;

    # Frontend (React estático)
    location / {
        root /var/www/tickets/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache busting para archivos
        location ~* \.(js|css)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Django
    location /api/ {
        proxy_pass http://gunicorn;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }

    # Admin Django
    location /admin/ {
        proxy_pass http://gunicorn;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://daphne;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # Estáticos Django
    location /static/ {
        alias /var/www/tickets/backend/staticfiles/;
        expires 30d;
    }

    # Media files
    location /media/ {
        alias /var/www/tickets/backend/media/;
        expires 7d;
    }

    # Denegar acceso a archivos sensibles
    location ~ /\. {
        deny all;
    }
}
```

```bash
# Habilitar site
sudo ln -s /etc/nginx/sites-available/tickets /etc/nginx/sites-enabled/
sudo nginx -t  # Verificar sintaxis
sudo systemctl restart nginx
```

---

## 🔒 FASE 5: SSL CON LETSENCRYPT

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generar certificado (automático con Nginx)
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Probar renovación
sudo certbot renew --dry-run
```

---

## 📊 FASE 6: BACKUPS Y MONITOREO

### **Script de Backup Diario**

```bash
# Archivo: /usr/local/bin/backup-tickets.sh

#!/bin/bash
BACKUP_DIR="/var/backups/tickets"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/tickets-backup.log"

mkdir -p $BACKUP_DIR

echo "[$DATE] Iniciando backup..." >> $LOG_FILE

# Backup BD PostgreSQL
PGPASSWORD=password_muy_fuerte_aqui_cambiar pg_dump \
    -h localhost \
    -U tickets_user \
    -d tickets_db | gzip > $BACKUP_DIR/tickets_$DATE.sql.gz

if [ $? -eq 0 ]; then
    echo "[$DATE] ✓ BD backup exitoso" >> $LOG_FILE
else
    echo "[$DATE] ✗ BD backup falló" >> $LOG_FILE
fi

# Backup archivos media
tar -czf $BACKUP_DIR/media_$DATE.tar.gz \
    /var/www/tickets/backend/media/ 2>/dev/null

if [ $? -eq 0 ]; then
    echo "[$DATE] ✓ Media backup exitoso" >> $LOG_FILE
else
    echo "[$DATE] ✗ Media backup falló" >> $LOG_FILE
fi

# Subir a AWS S3 (opcional)
# aws s3 cp $BACKUP_DIR/tickets_$DATE.sql.gz \
#     s3://mi-bucket-backups/tickets/

# Mantener solo últimos 14 días
find $BACKUP_DIR -type f -mtime +14 -delete

echo "[$DATE] Backup completado" >> $LOG_FILE
```

```bash
# Hacer ejecutable
sudo chmod +x /usr/local/bin/backup-tickets.sh

# Agregar a crontab (3 AM diario)
sudo crontab -e
# Agregar línea:
# 0 3 * * * /usr/local/bin/backup-tickets.sh
```

### **Monitoreo Básico**

```bash
# Ver estado de servicios
sudo systemctl status gunicorn-tickets
sudo systemctl status daphne-tickets
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis-server

# Ver logs en tiempo real
sudo tail -f /var/www/tickets/logs/gunicorn-error.log
sudo tail -f /var/www/tickets/logs/nginx-error.log

# Ver uso de recursos
free -h  # Memoria
df -h    # Disco
ps aux | grep python  # Procesos
```

---

## ✅ VERIFICACIÓN FINAL

```bash
# Verificar que todo está corriendo
curl http://127.0.0.1:8000/api/  # Gunicorn
curl http://127.0.0.1:8001/ws/  # Daphne (error es normal)
curl http://localhost/api/  # Nginx
curl https://tu-dominio.com/api/  # HTTPS

# Pruebas de funcionalidad
# 1. Ir a https://tu-dominio.com
# 2. Login en el admin
# 3. Crear un ticket de prueba
# 4. Verificar que llega el email
# 5. Probar WebSocket en consola del navegador

# Ver que los logs están limpios
grep ERROR /var/www/tickets/logs/*.log
```

---

## 🚨 TROUBLESHOOTING COMÚN

```bash
# Error: Connection refused en Gunicorn
# Solución: sudo systemctl restart gunicorn-tickets

# Error: Permission denied en archivos
# Solución: sudo chown -R tickets:tickets /var/www/tickets

# Error: PostgreSQL connection failed
# Solución: sudo systemctl restart postgresql

# Error: Redis connection refused
# Solución: sudo systemctl restart redis-server

# Error: SSL certificate not found
# Solución: sudo certbot certonly --standalone -d tu-dominio.com

# Ver logs completos
sudo journalctl -u gunicorn-tickets -n 50 -f
sudo journalctl -u daphne-tickets -n 50 -f
```

---

## 🎯 PRÓXIMOS PASOS DESPUÉS DE DEPLOYMENT

1. [ ] Verificar que backups funcionan
2. [ ] Configurar alertas (New Relic, Datadog)
3. [ ] Setup de monitoreo de uptime (Uptime Robot)
4. [ ] Documentar procesos de recuperación
5. [ ] Entrenar al equipo en mantenimiento
6. [ ] Planificar updates de seguridad mensuales

---

**Documento: COMANDOS DEPLOYMENT PRÁCTICO**  
**Versión:** 1.0  
**Actualizado:** Abril 2026  
**Tiempo estimado:** 3-4 horas para deployment completo
