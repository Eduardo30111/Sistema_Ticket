# 🚀 Guía de Deployment - Sistema de Tickets

## Opciones de Deployment

Tienes 2 opciones principales:

---

## Opción 1: Todo en un servidor (Recomendado para producción sencilla)

**Ventajas:**
- Un solo servidor
- Fácil mantenimiento
- Costo menor

**Pasos:**

### 1. Configurar Django para producción

Edita `backend/backend/settings.py`:

```python
# Cambiar DEBUG
DEBUG = False

# Configurar host permitido
ALLOWED_HOSTS = ['tu-dominio.com', 'www.tu-dominio.com', '127.0.0.1']

# Permitir CORS desde tu dominio
CORS_ALLOWED_ORIGINS = [
    'https://tu-dominio.com',
    'https://www.tu-dominio.com',
]

# Configurar base de datos (usar PostgreSQL en producción)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'tickets_db',
        'USER': 'postgres_user',
        'PASSWORD': 'secure_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# Secret key más segura (generar una nueva)
SECRET_KEY = 'generar-una-clave-aleatoria-larga-muy-segura'
```

### 2. Build del frontend

```bash
cd frontend
npm run build
```

Esto crea una carpeta `dist/` con los archivos estáticos.

### 3. Configurar Django para servir el frontend

Opción A: Copiar `dist/` a la carpeta de estáticos de Django:

```bash
# En Windows PowerShell
cp -r frontend\dist\* backend\static\

# Luego en Django
python manage.py collectstatic --noinput
```

Opción B: Configurar Nginx (recomendado):

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Frontend (React compilado)
    location / {
        root /var/www/tickets/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API backend (Django)
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin Django
    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
```

### 4. Usar un servidor WSGI (Gunicorn)

```bash
pip install gunicorn

# Ejecutar
gunicorn backend.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

### 5. Usar supervisor para mantener el proceso activo

```bash
pip install supervisor

# Crear configuración en /etc/supervisor/conf.d/tickets.conf
[program:tickets]
command=/path/to/venv/bin/gunicorn backend.wsgi:application --bind 127.0.0.1:8000
directory=/path/to/backend
autostart=true
autorestart=true
```

---

## Opción 2: Servidores separados (Recomendado para escala)

**Ventajas:**
- Frontend y backend escalan independientemente
- Mejor rendimiento
- Más flexible

### Frontend: Vercel o Netlify

1. **Vercel** (recomendado para Next.js/Vite):
```bash
npm install -g vercel
cd frontend
vercel
```

2. **Netlify**:
- Conecta tu repositorio GitHub
- Build command: `npm run build`
- Publish directory: `dist`

3. En `.env.production`:
```
VITE_API_URL=https://api.tu-dominio.com/api
```

### Backend: Digital Ocean, AWS, Heroku, etc.

#### Opción 2A: Heroku (simple, todo incluido)

```bash
# Instalar Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Crear app
heroku create tu-app-tickets

# Configurar variables de entorno
heroku config:set DEBUG=False
heroku config:set SECRET_KEY="tu-clave-segura"
heroku config:set ALLOWED_HOSTS="tu-app-tickets.herokuapp.com"

# Deploy
git push heroku main
```

Crear archivo `Procfile` en backend/:
```
web: gunicorn backend.wsgi --log-file -
```

#### Opción 2B: Digital Ocean App Platform

1. Conecta repositorio GitHub
2. Selecciona `backend/` como raíz
3. Configura environment variables
4. Deploy automático

#### Opción 2C: AWS EC2

```bash
# Conectar por SSH
ssh -i tu-clave.pem ubuntu@tu-instancia.com

# Instalar dependencias
sudo apt update
sudo apt install python3 python3-pip python3-venv nginx postgresql

# Clonar repo y configurar
git clone tu-repo
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Crear archivo requirements.txt primero:
pip freeze > requirements.txt

# Migraciones
python manage.py migrate

# Gunicorn
gunicorn backend.wsgi:application --bind 127.0.0.1:8000
```

---

## 📋 Checklist de Deployment

### Antes de hacer deploy:

- [ ] Cambiar `DEBUG = False` en settings.py
- [ ] Generar nueva `SECRET_KEY`
- [ ] Configurar `ALLOWED_HOSTS` con tu dominio
- [ ] Configurar CORS para tu dominio
- [ ] Usar base de datos PostgreSQL (no SQLite)
- [ ] Configurar email SMTP (Gmail/SendGrid/Amazon SES)
- [ ] Build del frontend: `npm run build`
- [ ] Probar localmente en modo producción
- [ ] Crear archivo `requirements.txt` en backend
- [ ] Usar HTTPS (Let's Encrypt)
- [ ] Configurar backups automáticos

### Archivo requirements.txt

```bash
cd backend
pip freeze > requirements.txt
```

Contenido típico:
```
Django==5.2.10
djangorestframework==3.16.1
djangorestframework-simplejwt==5.5.1
django-cors-headers==4.9.0
pillow==12.1.0
reportlab==4.4.9
psycopg2-binary==2.9.9  # Para PostgreSQL
gunicorn==21.2.0
```

---

## 🔐 Variables de Entorno Importantes

### Backend (.env o Heroku config)

```
DEBUG=False
SECRET_KEY=your-very-long-random-secret-key
ALLOWED_HOSTS=tu-dominio.com,www.tu-dominio.com
CORS_ALLOWED_ORIGINS=https://frontend-url.com

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# Database (si usas PostgreSQL en la nube)
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Frontend (.env.production)

```
VITE_API_URL=https://api.tu-dominio.com/api
```

---

## 🧪 Testing en Producción

1. **Crear usuario de prueba**:
```bash
python manage.py createsuperuser
```

2. **Probar endpoints clave**:
```bash
# Login
curl -X POST https://tu-dominio.com/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Listar tickets
curl -H "Authorization: Bearer TOKEN" \
  https://tu-dominio.com/api/tickets/
```

3. **Probar flujo completo**:
   - Crear ticket desde UI
   - Cambiar estado
   - Cerrar ticket
   - Verificar correo
   - Descargar PDF

---

## 📞 Soporte Rápido

- **Django no inicia**: `python manage.py check`
- **Estáticos no cargan**: `python manage.py collectstatic --noinput`
- **Migraciones fallidas**: `python manage.py migrate --fake-initial`
- **Errores en logs**: `tail -f /var/log/gunicorn/error.log`

---

**¡Sistema listo para production! 🎉**
