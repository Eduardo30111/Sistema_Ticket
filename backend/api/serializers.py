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
            'asignado',
            'tiempo_estipulado_dias',
            'fecha_limite',
            'dias_restantes',
            'alerta_tiempo',
            'alerta_nivel',
            'alerta_mensaje',
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
        return ticket

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
            'observaciones',
            'equipo_tipo',
            'equipo_serie',
            'descripcion',
        ]


class SolicitarTicketSerializer(serializers.Serializer):
    personName = serializers.CharField(max_length=100)
    personId = serializers.CharField(max_length=50)
    equipmentType = serializers.CharField(max_length=50)
    equipmentSerial = serializers.CharField(max_length=120, required=False, allow_blank=True)
    damageType = serializers.CharField(max_length=50)
    description = serializers.CharField(max_length=1000)
    officeCode = serializers.CharField(max_length=50, required=False, allow_blank=True)
    dependencia = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


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



