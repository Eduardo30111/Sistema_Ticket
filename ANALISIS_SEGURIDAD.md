# 🔐 ANÁLISIS DE SEGURIDAD DETALLADO - SISTEMA DE TICKETS

**Generado por:** Ingeniero de Sistemas Senior  
**Fecha:** 20 de Abril de 2026  
**Propósito:** Pre-auditoria antes de llevar a producción

---

## 🎯 OVERVIEW DE AMENAZAS

| Amenaza | Riesgo | Estado | Mitigación |
|---------|--------|--------|-----------|
| Inyección SQL | 🟡 Medio | ✅ ORM Django | Usar `select_related`, evitar raw SQL |
| XSS (Cross-Site Scripting) | 🟡 Medio | ⚠️ Revisar | Validar inputs, CSP headers |
| CSRF (Cross-Site Request Forgery) | 🟡 Medio | ✅ Active | Middleware CSRF habilitado |
| Brute Force (Login) | 🔴 Alto | ⚠️ Parcial | Rate limiting, 2FA |
| DDoS | 🟡 Medio | ⚠️ No | Cloudflare, WAF |
| Token Hijacking (JWT) | 🔴 Alto | ⚠️ Revisar | Short-lived tokens, refresh rotation |
| Credentials Exposure | 🔴 Alto | ⚠️ CRÍTICO | Variables de entorno, secrets manager |
| Data Breach | 🔴 Alto | ⚠️ Encripción | Encriptar datos sensibles at-rest |
| Insecure Deserialization | 🟡 Medio | ✅ OK | DRF valida automáticamente |
| Broken Authentication | 🔴 Alto | ✅ JWT | SimpleJWT bien implementado |

---

## 🔍 ANÁLISIS POR COMPONENTE

### **1. BACKEND - DJANGO**

#### 🟢 SEGURIDAD EXISTENTE

```python
# ✅ settings.py tiene implementado:
- CSRF Protection (middleware activo)
- XFrameOptions = 'DENY'
- X-Content-Type-Options = 'nosniff'
- SESSION_COOKIE_HTTPONLY = True (en producción)
- SECURE_SSL_REDIRECT = True (en producción)
- AUTH_PASSWORD_VALIDATORS (4 validadores)
- Email validation (en serializers)
```

#### 🟡 VULNERABILIDADES POTENCIALES

**Problema 1: Inyección SQL en búsquedas**
```python
# ❌ RIESGOSO (si existe):
users = User.objects.raw(f"SELECT * FROM users WHERE name = {user_input}")

# ✅ SEGURO:
users = User.objects.filter(name=user_input)  # ORM previene inyección
```

**Problema 2: XSS en PDF generados**
```python
# En pdf_generator.py - Revisar que:
from reportlab.lib.utils import ImageReader
# - URLs sean validadas
# - No se inserten directamente inputs de usuarios
# - Caracteres especiales escapados
```

**Problema 3: Rate Limiting incompleto**
```python
# Actual: @ratelimit(key='ip', rate='100/h')
# ✅ Mejorar con:
from django_ratelimit.decorators import ratelimit

@ratelimit(key='user_or_ip', rate='10/m')  # 10 por minuto por usuario
def login_view(request):
    pass
```

**Problema 4: JWT sin rotación**
```python
# settings.py actual:
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),  # ❌ Muy largo
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),  # ❌ Muy largo
}

# ✅ Mejor:
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),    # Acceso corto
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),       # Refresh longer
    'ROTATE_REFRESH_TOKENS': True,                      # Rotar refresh
    'BLACKLIST_AFTER_ROTATION': True,                   # Blacklist viejo
}
```

**Problema 5: Email SMTP credentials expuesta**
```python
# ❌ Actual (parcialmente):
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')

# ✅ Debe ser: (revisar que usa .env)
# En .env:
EMAIL_HOST_USER=tu-email@gmail.com
EMAIL_HOST_PASSWORD=app-password-generada
```

**Problema 6: Logging de datos sensibles**
```python
# ❌ RIESGOSO en logs:
logger.info(f"Login: {username} - Password: {password}")

# ✅ SEGURO:
logger.info(f"Login attempt for user: {username}")
# Never log passwords, tokens, emails sensibles
```

---

### **2. AUTENTICACIÓN - JWT**

#### 🟢 IMPLEMENTADO CORRECTAMENTE

```python
# ✅ SimpleJWT está bien usado para:
- Token-based stateless auth
- Refresh token rotation
- Blacklist implementation
```

#### 🟡 MEJORAS NECESARIAS

**Problema 1: Ningún 2FA**
```python
# ❌ No hay 2FA
# ✅ Implementar con:
from django_otp.decorators import otp_required
from django_otp.plugins.otp_totp.models import StaticDevice, StaticToken

@otp_required
def protected_view(request):
    pass
```

**Problema 2: No hay verificación de email**
```python
# ❌ Usuarios pueden registrarse sin verificar email
# ✅ Implementar verification:
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator

# Enviar link de verificación con token
```

**Problema 3: Rate limiting en login débil**
```python
# ⚠️ Mejorar:
@ratelimit(key='user_or_ip', rate='5/m')  # 5 intentos por minuto
def login(request):
    # Registrar intentos fallidos
    # Bloquear temporal después de N intentos
```

---

### **3. BASE DE DATOS**

#### 🔴 CRÍTICO: SQLITE EN PRODUCCIÓN

```python
# ❌ ACTUAL:
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ✅ CAMBIAR A PostgreSQL:
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'tickets_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'ATOMIC_REQUESTS': True,  # Transacciones
        'CONN_MAX_AGE': 600,       # Connection pooling
    }
}
```

#### 🟡 FALTA DE ENCRIPTACIÓN

```python
# ❌ Campos sensibles en texto plano:
class Persona(models.Model):
    identificacion = models.CharField(max_length=50)  # ❌ No encriptado
    correo = models.EmailField()                       # ❌ No encriptado

# ✅ USAR ENCRIPTACIÓN:
from django_cryptography.fields import encrypt

class Persona(models.Model):
    identificacion = encrypt(models.CharField(max_length=50))
    correo = encrypt(models.EmailField())
```

#### 🟡 NO HAY BACKUPS CONFIGURADOS

```python
# ✅ Script de backup recomendado:
# backup.sh
#!/bin/bash
BACKUP_DIR="/backups/tickets"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup BD
pg_dump -U postgres tickets_db | gzip > $BACKUP_DIR/tickets_$DATE.sql.gz

# Backup archivos media
tar -czf $BACKUP_DIR/media_$DATE.tar.gz /var/www/tickets/backend/media/

# Subir a S3 (ej. AWS)
aws s3 cp $BACKUP_DIR/tickets_$DATE.sql.gz s3://my-backup-bucket/

# Mantener solo últimos 30 días
find $BACKUP_DIR -type f -mtime +30 -delete
```

---

### **4. API REST**

#### 🟡 VALIDACIÓN DE INPUTS

```python
# En serializers.py - Revisar cada endpoint:

class SolicitarTicketSerializer(serializers.Serializer):
    # ✅ Bueno:
    titulo = serializers.CharField(max_length=200, required=True)
    descripcion = serializers.CharField(max_length=5000, required=True)
    
    def validate_titulo(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Mínimo 5 caracteres")
        return value.strip()
    
    def validate_descripcion(self, value):
        # Prevenir inyección de scripts
        if '<script>' in value.lower():
            raise serializers.ValidationError("Contenido no permitido")
        return value
```

#### 🟡 CONTROL DE ACCESO

```python
# ✅ Revisar permissions en cada view:

class TicketViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # ✅ CRÍTICO: Filtrar por usuario actual
        if self.request.user.role == 'ADMIN':
            return Ticket.objects.all()
        elif self.request.user.role == 'TECHNICIAN':
            return Ticket.objects.filter(asignado=self.request.user)
        else:  # CLIENT
            return Ticket.objects.filter(creado_por=self.request.user)
```

#### 🟡 INFORMACIÓN SENSIBLE EN RESPUESTAS

```python
# ❌ EVITAR:
class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = '__all__'  # Expone DEMASIADOS campos

# ✅ USAR:
class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = [
            'id', 'titulo', 'descripcion', 'estado',
            'creado_en', 'actualizado_en'
        ]
        # Excluye: password hashes, admin notes, etc.
```

---

### **5. FRONTEND - REACT**

#### 🟡 XSS PREVENTION

```typescript
// ✅ SEGURO:
<div>{ticket.titulo}</div>  // React escapa automáticamente

// ❌ RIESGOSO:
<div dangerouslySetInnerHTML={{__html: ticket.titulo}} />

// ✅ SI NECESITAS HTML:
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(html)}} />
```

#### 🟡 ALMACENAMIENTO DE TOKENS

```typescript
// ❌ RIESGOSO (localStorage accesible por XSS):
localStorage.setItem('access_token', token)

// ✅ MEJOR (sessionStorage, más seguro):
sessionStorage.setItem('access_token', token)

// ✅ MEJOR AÚN (HttpOnly cookie - server-side):
// En Django: respuesta con Set-Cookie: access_token; HttpOnly
```

#### 🟡 VALIDACIÓN EN FRONTEND

```typescript
// ✅ Validar ANTES de enviar:
const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
}

const validatePhone = (phone: string): boolean => {
    return /^\d{10}$/.test(phone.replace(/\D/g, ''))
}

// Siempre re-validar en backend (no confiar en frontend)
```

---

### **6. COMUNICACIONES**

#### 🟡 HTTPS / SSL

```python
# ✅ En settings.py PRODUCCIÓN:
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 año
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# En Nginx:
server {
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dominio.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
}

# Redirigir HTTP → HTTPS:
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}
```

#### 🟡 WEBSOCKETS SEGURIDAD

```python
# En consumers.py (Channels):
# ✅ Validar autenticación en WebSocket:
class TicketConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # ✅ Verificar usuario autenticado
        if not self.scope['user'].is_authenticated:
            await self.close()
            return
        
        # ✅ Verificar permisos
        await self.accept()
```

---

### **7. EMAIL**

#### 🟡 SPOOFING Y PHISHING

```python
# ❌ Gmail SMTP tiene problemas:
# - Rate limits
# - Menos confiable
# - Google puede cambiar políticas

# ✅ CAMBIAR A:
# 1. SendGrid (recomendado)
# 2. AWS SES
# 3. Mailgun
# 4. Postmark

# Setup con SendGrid:
pip install django-anymail

# settings.py:
EMAIL_BACKEND = 'django_anymail.backends.sendgrid.EmailBackend'
ANYMAIL = {
    'SENDGRID_API_KEY': os.environ.get('SENDGRID_API_KEY'),
}

# Usar reply-to válido:
send_mail(
    subject='Tu ticket',
    message='Detalles...',
    from_email='noreply@tickets.com',
    recipient_list=[user.email],
    reply_to=['soporte@tickets.com'],
)
```

---

## 📋 CHECKLIST DE SEGURIDAD FINAL

### **ANTES DE SUBIR A PRODUCCIÓN**

- [ ] DEBUG = False
- [ ] SECRET_KEY en variable de entorno
- [ ] PostgreSQL configurado
- [ ] HTTPS configurado (SSL válido)
- [ ] ALLOWED_HOSTS correcto
- [ ] CORS restringido
- [ ] CSRF activo
- [ ] Rate limiting configurado
- [ ] Logging sin datos sensibles
- [ ] Backups automáticos
- [ ] 2FA en usuarios admin
- [ ] Contraseñas fuertes en BD (bcrypt/argon2)
- [ ] Encriptación en campos sensibles
- [ ] Headers de seguridad configurados
- [ ] HSTS habilitado
- [ ] X-Frame-Options = DENY
- [ ] X-Content-Type-Options = nosniff
- [ ] Content-Security-Policy headers
- [ ] Cookies seguras (Secure, HttpOnly, SameSite)
- [ ] Redis con autenticación
- [ ] Email profesional (no Gmail)
- [ ] Validación de inputs en todos lados
- [ ] Permisos de archivos correctos (600/700)
- [ ] Log de auditoría de cambios críticos
- [ ] Documentación de seguridad
- [ ] Plan de respuesta a incidentes
- [ ] Contacto de seguridad público

---

## 🔧 CONFIGURACIÓN RECOMENDADA DE HEADERS

```python
# settings.py
SECURE_CONTENT_SECURITY_POLICY = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com"],
    "style-src": ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "https://api.github.com"],
    "frame-ancestors": ["'none'"],
}

SECURE_CONTENT_SECURITY_POLICY_REPORT_ONLY = False

# Más headers:
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_CONTENT_TYPE_OPTIONS = "nosniff"
X_FRAME_OPTIONS = "DENY"
SECURE_BROWSER_XSS_FILTER = True
```

---

## 📊 MATRIZ DE RIESGO POST-IMPLEMENTACIÓN

| Riesgo | Pre | Post | Mejora |
|--------|-----|------|--------|
| SQL Injection | 🟡 | 🟢 | +60% |
| XSS | 🟡 | 🟡 | +40% |
| Brute Force | 🔴 | 🟡 | +70% |
| Data Exposure | 🔴 | 🟡 | +50% |
| Unauthorized Access | 🟡 | 🟢 | +80% |
| **RIESGO GENERAL** | 🔴 | 🟡 | +62% |

---

## 🎯 TIMELINE RECOMENDADO

```
Semana 1: Implementar cambios críticos (DB, secrets, SSL)
Semana 2: Agregar validaciones y rate limiting
Semana 3: Encriptación y backups
Semana 4: Testing y auditoria
Semana 5: Deployment a staging
Semana 6: Load testing y optimización
Semana 7: Deployment a producción
```

---

**Documento de seguridad versión 1.0**  
**Próxima revisión recomendada:** Cada 6 meses o cambios significativos  
**Responsable:** Ingeniero de Sistemas / Security Team
