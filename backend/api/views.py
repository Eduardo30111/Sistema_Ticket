import uuid
from pathlib import Path

from django.contrib.auth.models import User
from django.http import FileResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Usuario, Equipo, Ticket, AsignacionTarea
from .pdf_generator import generar_pdf_ticket
from .serializers import (
    EquipoSerializer,
    SolicitarTicketSerializer,
    TicketSerializer,
    UsuarioSerializer,
    AsignacionTareaSerializer,
)
from .utils import enviar_correo_ticket
import logging

logger = logging.getLogger(__name__)


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer


class EquipoViewSet(viewsets.ModelViewSet):
    queryset = Equipo.objects.all()
    serializer_class = EquipoSerializer


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param == 'pending':
            qs = qs.filter(estado__in=['ABIERTO', 'EN_PROCESO'])
        elif status_param == 'completed':
            qs = qs.filter(estado='CERRADO')
        return qs.order_by('-fecha')

    def perform_create(self, serializer):
        ticket = serializer.save()
        
        # Generar PDF del ticket
        archivo_pdf = generar_pdf_ticket(ticket)
        
        # Enviar correo con PDF adjunto
        enviar_correo_ticket(
            asunto='📩 Nuevo ticket creado',
            mensaje=(
                f'Se ha creado un nuevo ticket\n\n'
                f'ID: {ticket.id}\n'
                f'Usuario: {ticket.usuario.nombre}\n'
                f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                f'Estado: {ticket.estado}\n'
                f'Descripción:\n{ticket.descripcion}\n\n'
                f'Adjunto encontrarás el PDF con los detalles del ticket.'
            ),
            destinatarios=[ticket.usuario.correo],
            archivo_adjunto=archivo_pdf
        )

    def perform_update(self, serializer):
        ticket = serializer.save()

        # Atendido_por: usar body si viene, si no el usuario autenticado
        try:
            nombre = (self.request.data.get('atendido_por') or '').strip()
            if not nombre and getattr(self.request, 'user', None):
                nombre = self.request.user.get_full_name() or self.request.user.username or ''
            if nombre:
                ticket.atendido_por = nombre
                ticket.save(update_fields=['atendido_por'])
        except Exception:
            pass

        if ticket.estado == 'CERRADO':
            # Generar PDF y enviar correo con el documento adjunto
            archivo_pdf = generar_pdf_ticket(ticket)
            
            enviar_correo_ticket(
                asunto='✅ Ticket cerrado',
                mensaje=(
                    f'El ticket #{ticket.id} ha sido cerrado.\n\n'
                    f'Usuario: {ticket.usuario.nombre}\n'
                    f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                    f'Atendido por: {getattr(ticket, "atendido_por", "")}\n'
                    f'Estado: {ticket.estado}\n'
                    f'Descripción:\n{ticket.descripcion}\n\n'
                    f'Adjunto encontrarás el PDF con los detalles finales del ticket.'
                ),
                destinatarios=[ticket.usuario.correo],
                archivo_adjunto=archivo_pdf
            )

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def pdf(self, request, pk=None):
        """Descargar PDF del ticket"""
        try:
            ticket = self.get_object()
            
            # Generar PDF si no existe
            ruta_pdf = generar_pdf_ticket(ticket)
            
            if Path(ruta_pdf).exists():
                return FileResponse(
                    open(ruta_pdf, 'rb'),
                    as_attachment=True,
                    filename=f'ticket_{ticket.id}.pdf'
                )
            else:
                return Response(
                    {'error': 'PDF no encontrado'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AsignacionTareaViewSet(viewsets.ModelViewSet):
    """ViewSet para gestionar asignaciones de tareas"""
    queryset = AsignacionTarea.objects.all()
    serializer_class = AsignacionTareaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        usuario_id = self.request.query_params.get('usuario_id')
        if usuario_id:
            try:
                # si el id corresponde directamente a un Usuario
                from .models import Usuario
                if Usuario.objects.filter(pk=usuario_id).exists():
                    qs = qs.filter(usuario_asignado_id=usuario_id)
                else:
                    # intentar mapear desde auth.User (el cliente puede enviar el id del JWT)
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    try:
                        auth_user = User.objects.filter(pk=int(usuario_id)).first()
                    except Exception:
                        auth_user = None
                    if auth_user:
                        # buscar Usuario por correo o por nombre
                        usuario = Usuario.objects.filter(correo=auth_user.email).first()
                        if not usuario:
                            usuario = Usuario.objects.filter(nombre=auth_user.get_full_name() or auth_user.username).first()
                        if usuario:
                            qs = qs.filter(usuario_asignado_id=usuario.id)
                        else:
                            # sin mapping; devolver queryset vacío
                            qs = qs.none()
                    else:
                        qs = qs.none()
            except Exception:
                qs = qs.none()
        return qs.order_by('-fecha_asignacion')

    def perform_create(self, serializer):
        """Cuando se crea una tarea, registrar quién la asignó"""
        asignacion = serializer.save()
        try:
            # enviar notificación vía channel layer al usuario asignado
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            from django.contrib.auth import get_user_model

            channel_layer = get_channel_layer()
            # notify by Usuario id
            group = f'user_{asignacion.usuario_asignado_id}'
            message = {
                'message': f'Te ha sido asignado el ticket #{asignacion.ticket_id}',
                'tarea_id': asignacion.id,
                'ticket_id': asignacion.ticket_id,
            }
            async_to_sync(channel_layer.group_send)(group, {
                'type': 'task_assigned',
                'message': message,
            })
            try:
                logger.info(f"Asignacion creada id={asignacion.id} -> notify groups: {group}")
            except Exception:
                pass

            # intentar mapear al auth.User por correo/nombre y notificar también a su grupo (cliente usa id de auth.User)
            try:
                User = get_user_model()
                usuario_model = asignacion.usuario_asignado
                if usuario_model:
                    # primero por correo
                    if usuario_model.correo:
                        auth_user = User.objects.filter(email=usuario_model.correo).first()
                    else:
                        auth_user = None
                    # si no por correo, intentar por nombre/username
                    if not auth_user:
                        auth_user = User.objects.filter(username=usuario_model.nombre).first()
                    if auth_user:
                        auth_group = f'user_{auth_user.id}'
                        async_to_sync(channel_layer.group_send)(auth_group, {
                            'type': 'task_assigned',
                            'message': message,
                        })
                        try:
                            logger.info(f"Also notifying auth.User id={auth_user.id} group={auth_group}")
                        except Exception:
                            pass
            except Exception:
                pass
        except Exception:
            pass
        # Enviar correo de asignación (si el usuario tiene correo)
        try:
            usuario = asignacion.usuario_asignado
            if usuario and usuario.correo:
                enviar_correo_ticket(
                    asunto='🔔 Tarea asignada',
                    mensaje=(
                        f'Hola {usuario.nombre},\n\nSe te ha asignado la siguiente tarea:\n'
                        f'Ticket: {asignacion.ticket.equipo.tipo} - {asignacion.ticket.equipo.serie}\n'
                        f'ID Tarea: {asignacion.id}\n\nPor favor revisa el sistema para más detalles.'
                    ),
                    destinatarios=[usuario.correo],
                )
        except Exception:
            pass
        return asignacion


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stats(request):
    """Estadísticas para el dashboard técnico."""
    try:
        from django.db.models import Count

        pending = Ticket.objects.filter(estado='ABIERTO').count()
        in_process = Ticket.objects.filter(estado='EN_PROCESO').count()
        closed = Ticket.objects.filter(estado='CERRADO').count()
        total = Ticket.objects.count()

        tech_qs = User.objects.filter(is_staff=True)
        technicians = [u.get_full_name() or u.username for u in tech_qs]

        # Rendimiento por técnico (atendido_por)
        per_tech = (
            Ticket.objects.filter(estado='CERRADO')
            .exclude(atendido_por__isnull=True)
            .exclude(atendido_por='')
            .values('atendido_por')
            .annotate(count=Count('id'))
        )
        technician_performance = {r['atendido_por']: r['count'] for r in per_tech}

        # Tipos de falla (tipo_dano)
        per_dano = (
            Ticket.objects.exclude(tipo_dano__isnull=True)
            .exclude(tipo_dano='')
            .values('tipo_dano')
            .annotate(count=Count('id'))
        )
        failure_types = {r['tipo_dano']: r['count'] for r in per_dano}

        # Frecuencia por equipo (tipo + serie agrupado por usuario/equipo sería más fino; simplificamos por tipo)
        per_equipo = (
            Ticket.objects.values('equipo__tipo')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        equipment_frequency = [
            {'equipmentType': r['equipo__tipo'] or 'N/A', 'count': r['count']}
            for r in per_equipo
        ]

        return Response({
            'pending': pending,
            'in_process': in_process,
            'closed': closed,
            'total': total,
            'technicians': technicians,
            'technicianPerformance': technician_performance,
            'failureTypes': failure_types,
            'equipmentFrequency': equipment_frequency,
            'totalTickets': total,
            'completedTickets': closed,
        })
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def diagnostico(request):
    """Endpoint de diagnóstico: verifica si Channels/Redis está funcionando"""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        
        # Intentar enviar un mensaje de prueba a un grupo
        test_group = 'diagnostic_test'
        test_message = {'type': 'test', 'data': 'ping'}
        
        async_to_sync(channel_layer.group_send)(test_group, test_message)
        
        return Response({
            'status': 'OK',
            'redis': 'CONECTADO',
            'channels': 'FUNCIONANDO',
            'message': 'Redis y Channels están operacionales. Los WebSockets deberían recibir notificaciones.'
        }, status=status.HTTP_200_OK)
    except ConnectionError as e:
        return Response({
            'status': 'ERROR',
            'redis': 'NO CONECTADO',
            'error': f'No se pudo conectar a Redis: {str(e)}. Inicia Redis: docker run -p 6379:6379 -d redis:7',
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        return Response({
            'status': 'ERROR',
            'error': str(e),
            'channels': 'PROBLEMA DESCONOCIDO'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def solicitar(request):
    """Crear ticket desde formulario público (personName, personId, equipmentType, damageType, description, email?, phone?)."""
    ser = SolicitarTicketSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    data = ser.validated_data
    correo = (data.get('email') or '').strip() or 'noreply@local'
    telefono = (data.get('phone') or '').strip()

    usuario = Usuario.objects.create(
        nombre=data['personName'],
        identificacion=data['personId'],
        correo=correo,
        telefono=telefono,
    )
    serie = f"SOL-{uuid.uuid4().hex[:8].upper()}"
    equipo = Equipo.objects.create(
        tipo=data['equipmentType'],
        serie=serie,
        marca='',
        modelo='',
    )
    ticket = Ticket.objects.create(
        usuario=usuario,
        equipo=equipo,
        descripcion=data['description'],
        tipo_dano=data['damageType'],
        estado='ABIERTO',
    )

    archivo_pdf = generar_pdf_ticket(ticket)
    if correo != 'noreply@local':
        try:
            enviar_correo_ticket(
                asunto='📩 Nuevo ticket creado',
                mensaje=(
                    f'Se ha creado un nuevo ticket\n\n'
                    f'ID: {ticket.id}\n'
                    f'Usuario: {ticket.usuario.nombre}\n'
                    f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                    f'Estado: {ticket.estado}\n'
                    f'Descripción:\n{ticket.descripcion}\n\n'
                    f'Adjunto encontrarás el PDF con los detalles del ticket.'
                ),
                destinatarios=[correo],
                archivo_adjunto=archivo_pdf,
            )
        except Exception:
            pass

    return Response({'ticketId': ticket.id}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request):
    """Login por email o username + password; devuelve access + refresh JWT."""
    email_or_user = (request.data.get('email') or request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    if not email_or_user or not password:
        return Response(
            {'error': 'email (o usuario) y contraseña son obligatorios'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if '@' in email_or_user:
        user = User.objects.filter(email__iexact=email_or_user).first()
    else:
        user = User.objects.filter(username__iexact=email_or_user).first()
    if not user or not user.check_password(password):
        return Response(
            {'error': 'Credenciales inválidas'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active:
        return Response(
            {'error': 'Usuario inactivo'},
            status=status.HTTP_403_FORBIDDEN,
        )
    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


