from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Equipo,
    Oficina,
    Persona,
    OficinaEquipo,
    SolicitudReactivacionContratista,
    Ticket,
    AsignacionTarea,
    MascotaFeedback,
    TicketMessage,
    InternalMessage,
)


class EquipoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipo
        fields = '__all__'


class OficinaSerializer(serializers.ModelSerializer):
    qr_payload = serializers.CharField(read_only=True)
    qr_image_url = serializers.CharField(read_only=True)

    class Meta:
        model = Oficina
        fields = ['id', 'nombre', 'codigo', 'descripcion', 'activa', 'qr_payload', 'qr_image_url']


class PersonaSerializer(serializers.ModelSerializer):
    oficina_nombre = serializers.CharField(source='oficina.nombre', read_only=True)
    vigente = serializers.BooleanField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)

    class Meta:
        model = Persona
        fields = [
            'id',
            'oficina',
            'oficina_nombre',
            'tipo',
            'nombre',
            'identificacion',
            'correo',
            'telefono',
            'fecha_inicio',
            'fecha_fin',
            'activo',
            'vigente',
            'estado_activo',
        ]


class OficinaEquipoSerializer(serializers.ModelSerializer):
    oficina_nombre = serializers.CharField(source='oficina.nombre', read_only=True)
    equipo_tipo = serializers.CharField(source='equipo.tipo', read_only=True)
    equipo_serie = serializers.CharField(source='equipo.serie', read_only=True)
    equipo_modelo = serializers.CharField(source='equipo.modelo', read_only=True)
    equipo_marca = serializers.CharField(source='equipo.marca', read_only=True)

    class Meta:
        model = OficinaEquipo
        fields = [
            'id',
            'oficina',
            'oficina_nombre',
            'equipo',
            'equipo_tipo',
            'equipo_serie',
            'equipo_modelo',
            'equipo_marca',
            'tipo_persona',
            'persona',
            'activo',
            'fecha_asignacion',
        ]


class SolicitudReactivacionContratistaSerializer(serializers.ModelSerializer):
    class Meta:
        model = SolicitudReactivacionContratista
        fields = ['id', 'persona', 'motivo', 'estado', 'fecha']
        read_only_fields = ['id', 'estado', 'fecha']


class TicketSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    equipo = EquipoSerializer(read_only=True)
    usuario_nombre = serializers.CharField(source='solicitante_nombre', read_only=True)
    usuario_identificacion = serializers.CharField(source='solicitante_identificacion', read_only=True)
    equipo_tipo = serializers.CharField(source='equipo.tipo', read_only=True)
    equipo_serie = serializers.CharField(source='equipo.serie', read_only=True)
    equipo_modelo = serializers.CharField(source='equipo.modelo', read_only=True, allow_null=True)
    oficina_nombre = serializers.CharField(source='oficina.nombre', read_only=True)
    oficina_codigo = serializers.CharField(source='oficina.codigo', read_only=True)
    asignacion_activa_usuario_id = serializers.SerializerMethodField()
    asignacion_activa_usuario_nombre = serializers.SerializerMethodField()
    equipo_id = serializers.PrimaryKeyRelatedField(
        source='equipo',
        queryset=Equipo.objects.all(),
        write_only=True,
        required=False,
    )
    tiempo_estipulado_dias = serializers.IntegerField(source='TIEMPO_ESTIPULADO_DIAS', read_only=True)
    fecha_limite = serializers.DateTimeField(read_only=True)
    dias_restantes = serializers.IntegerField(read_only=True)
    alerta_tiempo = serializers.BooleanField(read_only=True)
    alerta_nivel = serializers.CharField(read_only=True)
    alerta_mensaje = serializers.CharField(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            'id',
            'usuario',
            'equipo',
            'equipo_id',
            'usuario_nombre',
            'usuario_identificacion',
            'solicitante_nombre',
            'solicitante_identificacion',
            'solicitante_correo',
            'solicitante_telefono',
            'equipo_tipo',
            'equipo_serie',
            'equipo_modelo',
            'oficina_nombre',
            'oficina_codigo',
            'asignacion_activa_usuario_id',
            'asignacion_activa_usuario_nombre',
            'descripcion',
            'tipo_dano',
            'estado',
            'fecha',
            'pdf',
            'atendido_por',
            'procedimiento',
            'formato_servicio',
            'numero_ficha_tecnica',
            'asignado',
            'tiempo_estipulado_dias',
            'fecha_limite',
            'dias_restantes',
            'alerta_tiempo',
            'alerta_nivel',
            'alerta_mensaje',
            'demorado_publico',
        ]

    def get_usuario(self, obj):
        if not obj.solicitante_nombre and not obj.solicitante_identificacion:
            return None
        return {
            'nombre': obj.solicitante_nombre,
            'identificacion': obj.solicitante_identificacion,
            'correo': obj.solicitante_correo,
            'telefono': obj.solicitante_telefono,
        }

    def _active_assignment(self, obj):
        return obj.tareas.exclude(estado='FINALIZADA').order_by('-fecha_asignacion').first()

    def get_asignacion_activa_usuario_id(self, obj):
        asignacion = self._active_assignment(obj)
        return asignacion.usuario_asignado_id if asignacion else None

    def get_asignacion_activa_usuario_nombre(self, obj):
        asignacion = self._active_assignment(obj)
        if not asignacion:
            return None
        return asignacion.usuario_asignado.get_full_name() or asignacion.usuario_asignado.username

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        if not instance:
            return attrs
        old = instance.estado
        new = attrs.get('estado', old)
        if new == old:
            return attrs

        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        is_privileged = bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))

        if new == 'EN_PROCESO':
            if old != 'ABIERTO':
                raise serializers.ValidationError({'estado': 'Solo un ticket abierto puede pasar a en proceso.'})
        elif new == 'CERRADO':
            if old not in ('ABIERTO', 'EN_PROCESO'):
                raise serializers.ValidationError({'estado': 'No se puede cerrar el ticket desde este estado.'})
            if not is_privileged and old != 'EN_PROCESO':
                raise serializers.ValidationError(
                    {'estado': 'Primero debes pasar el ticket a En proceso antes de cerrarlo.'}
                )
        elif new != old:
            raise serializers.ValidationError({'estado': 'Transición de estado no permitida.'})

        return attrs


class AsignacionTareaSerializer(serializers.ModelSerializer):
    equipo_tipo = serializers.CharField(source='ticket.equipo.tipo', read_only=True)
    equipo_serie = serializers.CharField(source='ticket.equipo.serie', read_only=True)
    descripcion = serializers.CharField(source='ticket.descripcion', read_only=True)
    usuario_nombre = serializers.SerializerMethodField()
    ticket_id = serializers.IntegerField(source='ticket.id', read_only=True)

    def get_usuario_nombre(self, obj):
        user = obj.usuario_asignado
        # Intentar obtener el nombre completo, si no usar username
        full_name = user.get_full_name()
        return full_name if full_name else user.username

    def validate_ticket(self, ticket):
        if ticket.estado == 'CERRADO':
            raise serializers.ValidationError('No se puede asignar un ticket que ya esta cerrado.')
        if ticket.estado != 'ABIERTO':
            raise serializers.ValidationError('Solo se pueden asignar tickets en estado abierto.')
        return ticket

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        is_priv = bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))
        if not is_priv and 'plazo_hasta' in attrs:
            attrs.pop('plazo_hasta')
        return attrs

    class Meta:
        model = AsignacionTarea
        fields = [
            'id',
            'ticket',
            'ticket_id',
            'usuario_asignado',
            'usuario_nombre',
            'asignado_por',
            'estado',
            'fecha_asignacion',
            'fecha_finalizacion',
            'plazo_hasta',
            'observaciones',
            'equipo_tipo',
            'equipo_serie',
            'descripcion',
        ]


PUBLIC_TICKET_COOLDOWN_MINUTES = 15


class SolicitarTicketSerializer(serializers.Serializer):
    personName = serializers.CharField(max_length=100)
    personId = serializers.CharField(max_length=50, trim_whitespace=True)
    equipmentType = serializers.CharField(max_length=50, trim_whitespace=True)
    equipmentSerial = serializers.CharField(max_length=120, required=False, allow_blank=True, trim_whitespace=True)
    damageType = serializers.CharField(max_length=50, trim_whitespace=True)
    description = serializers.CharField(max_length=1000)
    officeCode = serializers.CharField(max_length=50, required=False, allow_blank=True, trim_whitespace=True)
    dependencia = serializers.CharField(max_length=150, required=False, allow_blank=True, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        """
        Reglas de negocio que deben ejecutarse siempre al validar el POST público
        (antes no se aplicaban si la validación solo vivía en _create_public_ticket sin pasar por is_valid en todos los casos).
        """
        raw_pid = (attrs.get('personId') or '').strip()
        if not raw_pid:
            return attrs

        persona = Persona.objects.filter(identificacion__iexact=raw_pid, activo=True).select_related('oficina').first()
        if not persona or not persona.estado_activo:
            return attrs

        canon_id = (persona.identificacion or raw_pid).strip()
        oficina = persona.oficina

        # Cooldown solo para tickets activos.
        # Si el admin elimina el ticket (o el último ya está cerrado), se permite reenviar de inmediato.
        last_ticket = (
            Ticket.objects.filter(
                Q(solicitante_identificacion__iexact=canon_id) | Q(solicitante_identificacion__iexact=raw_pid),
                estado__in=['ABIERTO', 'EN_PROCESO'],
            )
            .order_by('-fecha')
            .first()
        )
        if last_ticket:
            delta = timezone.now() - last_ticket.fecha
            if delta < timedelta(minutes=PUBLIC_TICKET_COOLDOWN_MINUTES):
                mins = int(delta.total_seconds() // 60)
                remaining = max(1, PUBLIC_TICKET_COOLDOWN_MINUTES - mins)
                raise serializers.ValidationError(
                    {
                        'non_field_errors': [
                            f'Debes esperar al menos {PUBLIC_TICKET_COOLDOWN_MINUTES} minutos entre una solicitud y otra. '
                            f'Podrás crear otro ticket en aproximadamente {remaining} minuto(s).',
                        ]
                    }
                )

        return attrs


class MascotaFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = MascotaFeedback
        fields = ['id', 'nombre', 'oficina', 'mejora', 'fecha']
        read_only_fields = ['id', 'fecha']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['mejora'].max_length = 1000


class TicketMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_username = serializers.CharField(source='sender.username', read_only=True)

    class Meta:
        model = TicketMessage
        fields = ['id', 'ticket', 'sender', 'sender_name', 'sender_username', 'message', 'created_at']
        read_only_fields = ['id', 'sender', 'sender_name', 'sender_username', 'created_at']

    def get_sender_name(self, obj):
        return obj.sender.get_full_name() or obj.sender.username


class InternalMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    recipient_name = serializers.SerializerMethodField()
    recipient_username = serializers.CharField(source='recipient.username', read_only=True)

    class Meta:
        model = InternalMessage
        fields = [
            'id',
            'sender',
            'sender_name',
            'sender_username',
            'recipient',
            'recipient_name',
            'recipient_username',
            'message',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'sender',
            'sender_name',
            'sender_username',
            'recipient_name',
            'recipient_username',
            'created_at',
        ]

    def get_sender_name(self, obj):
        return obj.sender.get_full_name() or obj.sender.username

    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.username



