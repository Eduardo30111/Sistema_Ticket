# 🎫 Sistema de Tickets - Guía de Prueba

## ✅ Estado Actual
- ✅ Backend (Django) corriendo en `http://localhost:8001`
- ✅ Frontend (React) corriendo en `http://localhost:5173`
- ✅ Base de datos con usuarios y equipos de prueba
- ✅ Notificaciones en tiempo real (toasts)
- ✅ Generación y descarga de PDFs
- ✅ Envío de correos automáticos

---

## 📝 Credenciales de Prueba

**Login del Sistema:**
- Username: `admin`
- Password: `admin123`

**Usuarios de prueba (para crear tickets):**
- Juan Pérez (juan@example.com)
- María García (maria@example.com)
- Carlos López (carlos@example.com)

**Equipos disponibles:**
- Laptop Dell Inspiron 15 (LAP-001)
- Desktop HP ProDesk 400 (DES-001)
- Impresora Canon MF445dw (IMP-001)

---

## 🧪 Flujo de Prueba Completo

### Paso 1: Acceder al sistema
1. Abre `http://localhost:5173` en tu navegador
2. Inicia sesión con:
   - Username: `admin`
   - Password: `admin123`

### Paso 2: Crear un ticket
1. Haz clic en tab "➕ Crear Ticket"
2. Selecciona:
   - Usuario: "Juan Pérez"
   - Equipo: "Laptop Dell Inspiron 15"
   - Descripción: "La pantalla no enciende"
3. Haz clic en "Crear Ticket"
4. ✅ Verás notificación "Ticket creado exitosamente"
5. ✅ Se envía correo a `juan@example.com` con PDF adjunto

### Paso 3: Aceptar ticket (cambiar a EN_PROCESO)
1. Ve a tab "📋 Ver Tickets"
2. Busca el ticket que creaste
3. Haz clic en botón "Aceptar"
4. ✅ Estado cambia a "EN_PROCESO"
5. ✅ Notificación: "Ticket marcado como en proceso"
6. ✅ El campo "Atendido por" se llena con tu nombre de usuario

### Paso 4: Cerrar ticket (cambiar a CERRADO)
1. En la fila del ticket, haz clic en "Cerrar"
2. ✅ Estado cambia a "CERRADO"
3. ✅ Notificación: "Ticket marcado como cerrado"
4. ✅ Notificación: "Enviando correo con PDF al cliente..."
5. ✅ Se envía correo a `juan@example.com` con PDF del ticket cerrado
6. ✅ En la tabla aparece botón "📄 Ver PDF" para descargar

### Paso 5: Verificar PDF
1. En la fila del ticket cerrado, haz clic en "📄 Ver PDF"
2. ✅ Se descarga el PDF con información:
   - Número de ticket
   - Nombre del usuario
   - Equipo (tipo, serie, marca, modelo)
   - Estado final (CERRADO)
   - Atendido por (tu nombre de usuario)
   - Descripción del problema

---

## 📧 Verificar Correos Enviados

Los correos se envían automáticamente a:
- **Al crear ticket**: Se envía a `juan@example.com` (usuario del ticket)
- **Al cerrar ticket**: Se envía a `juan@example.com` con PDF adjunto

> **Nota**: Los correos se envían usando la configuración en `backend/settings.py` (Gmail). 
> Si no ves los correos, verifica que el correo esté bien configurado.

---

## 🔧 Comandos Útiles

### Arrancar backend (si se cierra)
```bash
cd C:\Users\sanch\OneDrive\Escritorio\SistemaTickets\backend
& "..\venv\Scripts\Activate.ps1"
python manage.py runserver 8001
```

### Arrancar frontend (si se cierra)
```bash
cd C:\Users\sanch\OneDrive\Escritorio\SistemaTickets\frontend
npm run dev
```

### Crear más datos de prueba
```bash
cd C:\Users\sanch\OneDrive\Escritorio\SistemaTickets\backend
& "..\venv\Scripts\Activate.ps1"
python manage.py seed_data
```

### Ver admin de Django
```
http://localhost:8001/admin
Username: admin
Password: admin123
```

---

## 🐛 Troubleshooting

### Frontend no se conecta con backend
- ✅ Verifica que backend esté corriendo en `8001`
- ✅ Verifica CORS en `backend/settings.py` incluya `http://localhost:5173`
- ✅ Verifica `.env` del frontend tenga `VITE_API_URL=http://localhost:8001/api`

### Correos no se envían
- ✅ Verifica configuración de email en `backend/settings.py`
- ✅ Comprueba que la contraseña de Gmail sea la contraseña de aplicación, no la contraseña de cuenta

### PDF no se descarga
- ✅ Verifica que el ticket esté en estado "CERRADO"
- ✅ Comprueba que la carpeta `backend/api/tickets/` existe
- ✅ Verifica permisos de lectura en esa carpeta

---

## 📱 Próximos Pasos

- Agregar búsqueda y filtros de tickets
- Agregar estadísticas (tickets abiertos, en proceso, cerrados)
- Implementar exportación de reportes
- Mejorar diseño con más temas
- Agregar soporte para múltiples técnicos simultáneamente
- Deploy en servidor de producción

---

**¡Sistema listo para probar! 🚀**
