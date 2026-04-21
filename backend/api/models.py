from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from datetime import timedelta
from urllib.parse import quote
import math


class Equipo(models.Model):
    tipo = models.CharField(max_length=50)
    serie = models.CharField(max_length=50)
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)
    fecha_registro = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return f"{self.tipo} - {self.serie}"


class Oficina(models.Model):
    nombre = models.CharField(max_length=120)
    codigo = models.SlugField(max_length=50, unique=True)
    descripcion = models.CharField(max_length=220, blank=True, default='')
    activa = models.BooleanField(default=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Oficina'
        verbose_name_plural = 'Oficinas'

    def __str__(self):
        return f"{self.nombre} ({self.codigo})"

    def save(self, *args, **kwargs):
        if not self.codigo:
            base = slugify(self.nombre)[:40] or 'oficina'
            candidate = base
            suffix = 2
            while Oficina.objects.filter(codigo=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{suffix}"
                suffix += 1
            self.codigo = candidate
        super().save(*args, **kwargs)

    @property
    def qr_payload(self):
        office_token = f"OFICINA:{self.codigo}"
        return f"{settings.FRONTEND_PUBLIC_URL}/?qr={quote(office_token, safe='')}"

    @property
    def qr_image_url(self):
        payload = self.qr_payload
        return f"https://quickchart.io/qr?text={quote(payload, safe='')}&size=320&dark=0f7f43&light=ffffff"


class Persona(models.Model):
    TIPOS = [
        ('FUNCIONARIO', 'Funcionario'),
        ('CONTRATISTA', 'Contratista'),
    ]

    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='personas')
    tipo = models.CharField(max_length=20, choices=TIPOS, default='FUNCIONARIO')
    nombre = models.CharField(max_length=120)
    identificacion = models.CharField(max_length=50, unique=True)
    correo = models.EmailField(blank=True, default='')
    telefono = models.CharField(max_length=20, blank=True, default='')
    fecha_inicio = models.DateField(null=True, blank=True)
    fecha_fin = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Funcionario'
        verbose_name_plural = 'Funcionarios'

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()}) - {self.identificacion}"

    def clean(self):
        if self.tipo == 'CONTRATISTA':
            if not self.fecha_inicio or not self.fecha_fin:
                raise ValidationError('Los contratistas deben tener fecha de inicio y fecha de fin.')

    @property
    def vigente(self):
        if self.tipo != 'CONTRATISTA':
            return True
        if not self.fecha_inicio or not self.fecha_fin:
            return False
        hoy = timezone.localdate()
        return self.fecha_inicio <= hoy <= self.fecha_fin

    @property
    def estado_activo(self):
        return self.activo and self.vigente


class FuncionarioPersona(Persona):
    class Meta:
        proxy = True
        verbose_name = 'Funcionario'
        verbose_name_plural = 'Funcionarios'


class ContratistaPersona(Persona):
    class Meta:
        proxy = True
        verbose_name = 'Contratista'
        verbose_name_plural = 'Contratistas'


class OficinaEquipo(models.Model):
    TIPOS_PERSONA = [
        ('FUNCIONARIO', 'Funcionario'),
        ('CONTRATISTA', 'Contratista'),
        ('SIN_ASIGNAR', 'Sin asignar'),
    ]

    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='inventario')
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE, related_name='inventario_oficinas')
    tipo_persona = models.CharField(max_length=20, choices=TIPOS_PERSONA, default='SIN_ASIGNAR')
    persona = models.ForeignKey('Persona', null=True, blank=True, on_delete=models.SET_NULL, related_name='equipos_asignados')
    activo = models.BooleanField(default=True)
    fecha_asignacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['oficina__nombre', 'equipo__tipo', 'equipo__serie']
        verbose_name = 'Asignar equipo'
        verbose_name_plural = 'Equipos asignados'

    def __str__(self):
        persona_info = self.persona.identificacion if self.persona else "Sin asignar"
        return f"{self.oficina.nombre} - {self.equipo.tipo} ({persona_info})"

    def clean(self):
        if self.tipo_persona in ('FUNCIONARIO', 'CONTRATISTA') and not self.persona:
            raise ValidationError({'persona': 'Debes asignar una persona para este equipo.'})
        if self.tipo_persona == 'SIN_ASIGNAR' and self.persona_id:
            raise ValidationError('Si el equipo esta sin asignar, no puede tener persona asociada.')
        if self.persona and self.tipo_persona not in ('SIN_ASIGNAR',):
            if self.persona.tipo != self.tipo_persona:
                raise ValidationError({'tipo_persona': f'El tipo de persona no coincide con el tipo del registro ({self.persona.tipo}).'})
        # Validación para evitar asignaciones activas duplicadas del mismo equipo
        if self.activo:
            existing = OficinaEquipo.objects.filter(equipo=self.equipo, activo=True).exclude(pk=self.pk).first()
            if existing:
                if existing.oficina == self.oficina:
                    raise ValidationError('Este equipo ya está asignado a una persona de la misma oficina.')
                else:
                    raise ValidationError('Este equipo ya está asignado activamente a otra oficina.')

    def save(self, *args, **kwargs):
        # Si esta asignación es activa, desactivar cualquier otra asignación del mismo equipo
        if self.activo:
            OficinaEquipo.objects.filter(
                equipo=self.equipo,
                activo=True
            ).exclude(pk=self.pk).update(activo=False)
        super().save(*args, **kwargs)


class SolicitudReactivacionContratista(models.Model):
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
    ]

    persona = models.ForeignKey('Persona', on_delete=models.SET_NULL, null=True, blank=True, related_name='solicitudes_reactivacion')
    motivo = models.TextField()
    estado = models.CharField(max_length=20, choices=ESTADOS, default='PENDIENTE')
    fecha_nueva_vigencia = models.DateField(null=True, blank=True, help_text="Fecha hasta la cual será válida la reactivación")
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        verbose_name = 'Solicitud de reactivacion'
        verbose_name_plural = 'Solicitudes de reactivacion'

    def __str__(self):
        estado_display = self.get_estado_display()
        if self.fecha_nueva_vigencia:
            return f"Solicitud {self.persona.identificacion} - {estado_display} (hasta {self.fecha_nueva_vigencia})"
        return f"Solicitud {self.persona.identificacion} - {estado_display}"


class Ticket(models.Model):
    TIEMPO_ESTIPULADO_DIAS = 10
    UMBRAL_ALERTA_DIAS = 2

    ESTADOS = [
        ('ABIERTO', 'Abierto'),
        ('EN_PROCESO', 'En proceso'),
        ('CERRADO', 'Cerrado'),
    ]

    solicitante_nombre = models.CharField(max_length=100, blank=True, default='')
    solicitante_identificacion = models.CharField(max_length=50, blank=True, default='')
    solicitante_correo = models.EmailField(blank=True, default='')
    solicitante_telefono = models.CharField(max_length=20, blank=True, default='')
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE)
    oficina = models.ForeignKey(Oficina, null=True, blank=True, on_delete=models.SET_NULL, related_name='tickets')
    oficina_equipo = models.ForeignKey(OficinaEquipo, null=True, blank=True, on_delete=models.SET_NULL, related_name='tickets')
    descripcion = models.TextField()
    tipo_dano = models.CharField(max_length=50, blank=True, default='')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='ABIERTO')
    fecha = models.DateTimeField(auto_now_add=True)
    pdf = models.FileField(upload_to='tickets/', null=True, blank=True)
    atendido_por = models.CharField(max_length=100, null=True, blank=True)
    procedimiento = models.TextField(blank=True, default='')
    formato_servicio = models.JSONField(default=dict, blank=True)
    asignado = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['estado', '-fecha']),
            models.Index(fields=['solicitante_identificacion']),
            models.Index(fields=['-fecha']),
        ]

    @property
    def fecha_limite(self):
        if not self.fecha:
            return None
        return self.fecha + timedelta(days=self.TIEMPO_ESTIPULADO_DIAS)

    @property
    def dias_restantes(self):
        if not self.fecha:
            return None
        segundos_restantes = (self.fecha_limite - timezone.now()).total_seconds()
        dias_restantes = segundos_restantes / 86400
        if dias_restantes >= 0:
            return math.ceil(dias_restantes)
        return -math.ceil(abs(dias_restantes))

    @property
    def alerta_tiempo(self):
        if self.estado == 'CERRADO':
            return False
        restantes = self.dias_restantes
        if restantes is None:
            return False
        return restantes <= self.UMBRAL_ALERTA_DIAS

    @property
    def alerta_nivel(self):
        if not self.alerta_tiempo:
            return None
        if (self.dias_restantes or 0) < 0:
            return 'VENCIDO'
        return 'PROXIMO_A_VENCER'

    @property
    def alerta_mensaje(self):
        if self.estado == 'CERRADO':
            return ''
        restantes = self.dias_restantes
        if restantes is None:
            return ''
        if restantes < 0:
            dias_vencido = abs(restantes)
            return f'Ticket vencido hace {dias_vencido} día(s). SLA: {self.TIEMPO_ESTIPULADO_DIAS} días.'
        if restantes <= self.UMBRAL_ALERTA_DIAS:
            return f'Ticket próximo a vencer: faltan {restantes} día(s) para el límite de {self.TIEMPO_ESTIPULADO_DIAS} días.'
        return ''

    def __str__(self):
        return f"Ticket #{self.id} - {self.estado}"


# 🔥 NUEVO MÓDULO: ASIGNACIÓN DE TAREAS
class AsignacionTarea(models.Model):
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('EN_PROCESO', 'En proceso'),
        ('FINALIZADA', 'Terminada'),
    ]
    
    PRIORIDADES = [
        (1, '🟢 Baja - No urgente'),
        (2, '🟡 Media - Normal'),
        (3, '🔴 Alta - Urgente'),
    ]

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name='tareas'
    )

    usuario_asignado = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={'is_active': True},
        related_name='tareas_recibidas'
    )

    asignado_por = models.CharField(
        max_length=100,
        help_text="Nombre del usuario que asigna la tarea"
    )

    estado = models.CharField(
        max_length=20,
        choices=ESTADOS,
        default='PENDIENTE'
    )
    
    prioridad = models.IntegerField(
        choices=PRIORIDADES,
        default=2,
        help_text="Nivel de urgencia de la tarea"
    )

    fecha_asignacion = models.DateTimeField(auto_now_add=True)
    fecha_finalizacion = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(blank=True, default='')

    def clean(self):
        # Bloqueo de negocio: no permitir crear asignaciones para tickets cerrados.
        if self.ticket_id and self._state.adding and self.ticket.estado == 'CERRADO':
            raise ValidationError({'ticket': 'No se puede asignar un ticket que ya esta cerrado.'})

    def __str__(self):
        return f"Tarea #{self.id} - Ticket {self.ticket.id} (Prioridad {self.get_prioridad_display()})"
    
    class Meta:
        ordering = ['-prioridad', 'fecha_asignacion']


class WhatsAppConversation(models.Model):
    STEPS = [
        ('ASK_NAME', 'Solicitar nombre'),
        ('ASK_DEPENDENCIA', 'Solicitar dependencia'),
        ('ASK_EQUIPMENT', 'Solicitar equipo'),
        ('ASK_DAMAGE', 'Solicitar tipo de daño'),
        ('ASK_DESCRIPTION', 'Solicitar descripcion'),
        ('COMPLETED', 'Completado'),
    ]

    phone_number = models.CharField(max_length=30, unique=True)
    step = models.CharField(max_length=30, choices=STEPS, default='ASK_NAME')
    data = models.JSONField(default=dict, blank=True)
    last_message_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"WhatsApp {self.phone_number} ({self.step})"


class MascotaFeedback(models.Model):
    nombre = models.CharField(max_length=120)
    oficina = models.CharField(max_length=150)
    mejora = models.TextField()
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        verbose_name = 'Sugerencia'
        verbose_name_plural = 'Sugerencias'

    def __str__(self):
        return f"Feedback {self.nombre} - {self.oficina}"


class TicketMessage(models.Model):
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name='mensajes',
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='mensajes_ticket',
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Mensaje de ticket'
        verbose_name_plural = 'Mensajes de ticket'

    def __str__(self):
        return f"Ticket #{self.ticket_id} - {self.sender.username}"


class InternalMessage(models.Model):
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='internal_messages_sent',
    )
    recipient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='internal_messages_received',
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Mensaje interno'
        verbose_name_plural = 'Mensajes internos'

    def __str__(self):
        return f"{self.sender.username} -> {self.recipient.username}"



