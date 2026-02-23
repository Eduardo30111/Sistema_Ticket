from rest_framework import serializers
from .models import Usuario, Equipo, Ticket, AsignacionTarea


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = '__all__'


class EquipoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipo
        fields = '__all__'


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = '__all__'


class AsignacionTareaSerializer(serializers.ModelSerializer):
    equipo_tipo = serializers.CharField(source='ticket.equipo.tipo', read_only=True)
    equipo_serie = serializers.CharField(source='ticket.equipo.serie', read_only=True)
    descripcion = serializers.CharField(source='ticket.descripcion', read_only=True)
    usuario_nombre = serializers.CharField(source='usuario_asignado.nombre', read_only=True)
    ticket_id = serializers.IntegerField(source='ticket.id', read_only=True)

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
    damageType = serializers.CharField(max_length=50)
    description = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
