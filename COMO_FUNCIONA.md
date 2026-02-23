# Cómo funciona el sistema – paso a paso

## 1. Esquema general

```
[Usuario público]  →  Formulario web  →  POST /api/solicitar-ticket/  →  Crea ticket en BD
                                                                    →  Genera PDF
                                                                    →  (Opcional) Envía email

[Técnico]  →  Login (email + contraseña)  →  POST /api/auth/login/  →  JWT  →  Panel técnico
                                                                              →  Ver tickets (pendientes/completados)
                                                                              →  Completar ticket (nombre + procedimiento)
                                                                              →  Descargar PDF
                                                                              →  Ver estadísticas
```

---

## 2. Encender todo (en tu PC, fuera de Cursor)

Abre **dos terminales** (PowerShell o CMD).

### Terminal 1 – Backend (Django)

```powershell
cd "c:\Users\sanch\OneDrive\Escritorio\SistemaTickets\backend"
..\venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py seed_data
python manage.py runserver 8000
```

Deja esta terminal abierta. Deberías ver algo como:
`Starting development server at http://127.0.0.1:8000/`

### Terminal 2 – Frontend (React)

```powershell
cd "c:\Users\sanch\OneDrive\Escritorio\SistemaTickets\frontend"
npm install
npm run dev
```

Deja esta terminal abierta. Deberías ver algo como:
`Local: http://localhost:5173/`

---

## 3. Uso paso a paso

### Paso A – Solicitar un servicio (cualquiera, sin login)

1. Abre **http://localhost:5173** en el navegador.
2. Pestaña **“Solicitar Servicio”**.
3. Rellena:
   - Nombre, ID, tipo de equipo, tipo de daño, descripción.
   - (Opcional) Email y teléfono para notificaciones.
4. **Enviar solicitud**.
5. Verás un mensaje tipo “Ticket creado. ID: X”.
6. En backend se crea Usuario + Equipo + Ticket, se genera PDF y, si hay email, se envía correo.

### Paso B – Entrar como técnico

1. En la misma página, pestaña **“Portal Técnico”**.
2. Login:
   - **Email:** `tecnico@example.com`
   - **Contraseña:** `tecnico123`
3. **Iniciar sesión**.
4. Entras al **Panel de Control Técnico**.

### Paso C – Panel técnico

- **Pendientes:** tickets abiertos o en proceso. Puedes **Completar** cada uno.
- **Completados:** tickets cerrados. Puedes **Descargar PDF**.
- **Estadísticas:** gráficos (fallas, técnicos, equipos más atendidos).

Para **completar** un ticket:

1. Clic en **“Completar Ticket”** del ticket.
2. Escribe **Nombre del técnico** y **Descripción del procedimiento**.
3. **Completar servicio**.
4. El ticket pasa a “Completados”, se regenera el PDF y se envía email al usuario (si tiene correo).

---

## 4. URLs útiles

| Dónde | URL |
|-------|-----|
| App (React) | http://localhost:5173 |
| API Django | http://localhost:8000/api/ |
| Admin Django | http://localhost:8000/admin/ |

Admin: usuario `admin`, contraseña `admin123`.

---

## 5. Si algo falla

- **“disk I/O” con SQLite:** suele pasar en carpetas sincronizadas (OneDrive). Copia el proyecto a una ruta local no sincronizada (ej. `C:\dev\SistemaTickets`) y vuelve a hacer `migrate` y `seed_data`.
- **CORS o “Failed to fetch”:** backend en `8000`, frontend en `5173`. En `frontend/.env` debe estar `VITE_API_URL=http://localhost:8000/api`.
- **No arranca el backend:** `pip install -r requirements.txt` dentro del `venv` y asegúrate de estar en la carpeta `backend` al ejecutar `manage.py`.
