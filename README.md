# 🎫 Sistema de Tickets de Soporte Técnico

Un sistema completo de gestión de tickets para soporte técnico construido con **Django + React + TypeScript**.

## ✨ Características

### 🎯 Funcionalidades Principales
- ✅ **Crear Tickets**: Los clientes reportan problemas
- ✅ **Gestionar Tickets**: Los técnicos asignan y resuelven tickets
- ✅ **Estados**: ABIERTO → EN_PROCESO → CERRADO
- ✅ **Generación de PDF**: PDF automático con detalles del ticket
- ✅ **Correos Automáticos**: Notificaciones por email al crear y cerrar tickets
- ✅ **Descarga de PDF**: Los usuarios pueden descargar el PDF del ticket cerrado
- ✅ **Autenticación JWT**: Login seguro con tokens
- ✅ **Notificaciones en Tiempo Real**: Toasts visuales en la UI

### 🏗️ Arquitectura
- **Backend**: Django REST Framework + SimpleJWT
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Base de Datos**: SQLite (desarrollo) / PostgreSQL (producción)
- **Autenticación**: JWT Tokens
- **CORS**: Configurado para desarrollo y producción

---

## 📁 Estructura del Proyecto

```
SistemaTickets/
├── backend/                          # Django REST API
│   ├── api/                         # App principal
│   │   ├── models.py               # Modelos (Usuario, Equipo, Ticket)
│   │   ├── serializers.py          # Serializadores
│   │   ├── views.py                # Vistas/Endpoints
│   │   ├── urls.py                 # Rutas
│   │   ├── pdf_generator.py        # Generación de PDFs
│   │   ├── utils.py                # Funciones auxiliares (email)
│   │   ├── management/commands/    # Comandos personalizados
│   │   │   └── seed_data.py       # Crear datos de prueba
│   │   └── migrations/             # Migraciones DB
│   ├── backend/                    # Configuración del proyecto
│   │   └── settings.py             # Configuración (CORS, EMAIL, etc)
│   ├── manage.py
│   ├── db.sqlite3                  # Base de datos (desarrollo)
│   └── requirements.txt            # Dependencias Python
│
├── frontend/                        # React + TypeScript + Vite
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx             # Raíz y tabs público/técnico
│   │   │   └── components/         # TicketForm, AuthForm, TechnicianDashboard, etc.
│   │   ├── lib/
│   │   │   └── api.ts              # Cliente API Django (solicitar, tickets, stats, auth)
│   │   ├── styles/                 # Tailwind + tema (verde/amarillo)
│   │   └── main.tsx
│   ├── .env                        # VITE_API_URL (ej. http://localhost:8000/api)
│   └── vite.config.ts
│
├── TESTING_GUIDE.md                 # Guía para probar
├── DEPLOYMENT_GUIDE.md              # Guía para deployment
└── README.md                        # Este archivo
```

---

## 🚀 Quick Start

### Requisitos
- Node.js 18+
- Python 3.10+
- pip

### 1. Clonar y configurar

```bash
# Backend
cd backend
python -m venv venv
# Windows: .\venv\Scripts\activate  |  Linux/Mac: source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Migraciones y datos de prueba

```bash
cd backend
python manage.py migrate
python manage.py seed_data
```

### 3. Iniciar servidores

**Terminal 1 (Backend):**
```bash
cd backend
python manage.py runserver 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

Crea `frontend/.env` con:
```
VITE_API_URL=http://localhost:8000/api
```

### 4. Acceder

- **Frontend**: `http://localhost:5173`
- **Admin Django**: `http://localhost:8000/admin`
- **API**: `http://localhost:8000/api`

**Credenciales:**
- **Admin**: username `admin` / password `admin123`
- **Portal técnico (login por email)**: `tecnico@example.com` / `tecnico123`

---

## 📚 Documentación

- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Guía completa de prueba del sistema
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Guía para deployment en producción

---

## 🔑 Endpoints API

### Autenticación
```
POST   /api/token/           # Obtener token JWT
POST   /api/token/refresh/   # Refrescar token
```

### Usuarios
```
GET    /api/usuarios/        # Listar usuarios
POST   /api/usuarios/        # Crear usuario
GET    /api/usuarios/{id}/   # Obtener usuario
PUT    /api/usuarios/{id}/   # Actualizar usuario
DELETE /api/usuarios/{id}/   # Eliminar usuario
```

### Equipos
```
GET    /api/equipos/        # Listar equipos
POST   /api/equipos/        # Crear equipo
GET    /api/equipos/{id}/   # Obtener equipo
PUT    /api/equipos/{id}/   # Actualizar equipo
DELETE /api/equipos/{id}/   # Eliminar equipo
```

### Tickets
```
GET    /api/tickets/              # Listar (auth). ?status=pending|completed
GET    /api/tickets/{id}/         # Detalle (auth)
PATCH  /api/tickets/{id}/         # Actualizar / completar (auth)
GET    /api/tickets/{id}/pdf/     # Descargar PDF (auth)
POST   /api/solicitar-ticket/     # Crear desde formulario público (sin auth)
GET    /api/stats/                # Estadísticas dashboard (auth)
```

---

## 🔧 Comandos Útiles

### Backend
```bash
# Crear superuser
python manage.py createsuperuser

# Crear datos de prueba
python manage.py seed_data

# Hacer migraciones
python manage.py makemigrations
python manage.py migrate

# Acceder a shell interactivo
python manage.py shell
```

### Frontend
```bash
# Build para producción
npm run build

# Preview del build
npm run preview

# Lint
npm run lint
```

---

## 📧 Configuración de Email

Para que los correos funcionen, configura SMTP en `backend/backend/settings.py`:

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'tu-email@gmail.com'
EMAIL_HOST_PASSWORD = 'contraseña-de-aplicación'  # No tu contraseña de Gmail
```

> **Importante**: En Gmail, debes generar una "contraseña de aplicación" en vez de usar tu contraseña regular.

---

## 🧪 Flujo de Prueba

1. **Solicitar servicio (público)**: Pestaña "Solicitar Servicio" → Completa el formulario (nombre, ID, tipo equipo, tipo daño, descripción) → Enviar.
2. **Portal técnico**: Pestaña "Portal Técnico" → Login con `tecnico@example.com` / `tecnico123`.
3. **Panel**: Ver pendientes, completados, estadísticas. Completar un ticket (nombre técnico + procedimiento) y descargar PDF.

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| CORS Error | Verifica `CORS_ALLOWED_ORIGINS` en settings.py |
| 404 en endpoints | Verifica rutas en `backend/api/urls.py` |
| Correos no se envían | Verifica credenciales de email en settings.py |
| PDF no se descarga | Verifica carpeta `backend/api/tickets/` existe |
| Token expirado | Automáticamente se refresca con el refresh token |

---

## 📦 Dependencias Principales

### Backend
- Django 5.2.10
- Django REST Framework 3.16.1
- djangorestframework-simplejwt 5.5.1
- django-cors-headers 4.9.0
- Pillow 12.1.0
- ReportLab 4.4.9

### Frontend
- React 18
- TypeScript 5.5
- Vite 7.2
- Axios 1.6
- React Router v6
- Tailwind CSS 3.4

---

## 🚀 Deployment

Ver **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** para:
- Opción 1: Todo en un servidor (simple)
- Opción 2: Servidores separados (escalable)
- Deployment en Heroku, Vercel, Digital Ocean, AWS, etc.

---

## 📝 Notas Importantes

- Los PDFs se generan automáticamente al crear y cerrar tickets
- Los correos se envían automáticamente (requiere configuración SMTP)
- Los tokens JWT expiran en 5 minutos (por defecto) y se refrescan automáticamente
- Los datos de prueba incluyen 3 usuarios y 3 equipos por defecto
- La base de datos de prueba es SQLite; usa PostgreSQL en producción

---

## 👥 Autor

Sistema desarrollado con ❤️

---

## 📄 Licencia

Proyecto libre para uso educativo y comercial.

---

**¡Disfrutando del sistema! Si tienes preguntas, revisa las guías de [TESTING](./TESTING_GUIDE.md) y [DEPLOYMENT](./DEPLOYMENT_GUIDE.md). 🎉**
