from datetime import timedelta, datetime
from pathlib import Path
import json
import logging
from inventario.models import SalidaInventario, StockInventario
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse, parse_qs

from django.contrib.auth.models import User
from django.db.models import Q
from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django_ratelimit.decorators import ratelimit

logger = logging.getLogger(__name__)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import (
    Equipo,
    Oficina,
    Persona,
    OficinaEquipo,
    SolicitudReactivacionContratista,
    Ticket,
    AsignacionTarea,
    WhatsAppConversation,
    TicketMessage,
    InternalMessage,
)
from .pdf_generator import generar_pdf_ticket
from .notifications import (
    is_valid_notification_email,
    notify_internal_message,
    notify_ticket_chat_message,
    team_emails_for_demora,
)
from .utils import enviar_correo_ticket
from .sticker_generator import generar_sticker_oficina_png
from .serializers import (
    EquipoSerializer,
    OficinaSerializer,
    PersonaSerializer,
    OficinaEquipoSerializer,
    SolicitudReactivacionContratistaSerializer,
    SolicitarTicketSerializer,
    MascotaFeedbackSerializer,
    TicketSerializer,
    AsignacionTareaSerializer,
    TicketMessageSerializer,
    InternalMessageSerializer,
)


def _resolve_user_modules(user: User) -> dict:
    if not user or not user.is_authenticated:
        return {
            'support': False,
            'inventory': False,
            'office': False,
            'observations': False,
        }
    if user.is_superuser:
        return {
            'support': True,
            'inventory': True,
            'office': True,
            'observations': True,
        }
    if not user.is_staff:
        return {
            'support': True,
            'inventory': True,
            'office': True,
            'observations': True,
        }

    perms = user.user_permissions.select_related('content_type')
    has_inventory = perms.filter(
        content_type__app_label='inventario',
        content_type__model__in=['stockinventario', 'salidainventario'],
    ).exists()
    has_support = perms.filter(
        content_type__app_label='api',
        content_type__model__in=['ticket', 'asignaciontarea'],
    ).exists()
    has_office = perms.filter(
        content_type__app_label='api',
        content_type__model__in=[
            'oficina',
            'persona',
            'oficinaequipo',
            'solicitudreactivacioncontratista',
            'equipo',
        ],
    ).exists()
    has_observations = perms.filter(
        content_type__app_label='otros',
        content_type__model__in=['equipootros', 'ticketotros', 'asignaciontareaotros'],
    ).exists() or perms.filter(
        content_type__app_label='api',
        content_type__model='mascotafeedback',
    ).exists()
    return {
        'support': has_support,
        'inventory': has_inventory,
        'office': has_office,
        'observations': has_observations,
    }


def _normalize_damage_type(value: str) -> str:
    if not value:
        return ''
    normalized = str(value)
    normalized = normalized.replace('Danio', 'Daño').replace('danio', 'daño')
    normalized = normalized.replace('Dano', 'Daño').replace('dano', 'daño')
    normalized = normalized.replace('fisico', 'físico').replace('Fisico', 'Físico')
    return normalized


def _parse_office_code(raw_value: str) -> str:
    value = (raw_value or '').strip()
    if value.startswith('http://') or value.startswith('https://'):
        try:
            parsed = urlparse(value)
            params = parse_qs(parsed.query)
            candidate = ''
            if params.get('qr'):
                candidate = (params.get('qr') or [''])[0]
            elif params.get('officeCode'):
                candidate = (params.get('officeCode') or [''])[0]
            value = (candidate or value).strip()
        except Exception as e:
            logger.debug(f"Failed to parse URL for office code: {e}")
    if value.upper().startswith('OFICINA:'):
        return value.split(':', 1)[1].strip().lower()
    return value.lower()


def _get_active_person_by_identification(person_id: str):
    person_id = (person_id or '').strip()
    if not person_id:
        return None, None

    persona = Persona.objects.filter(identificacion__iexact=person_id, activo=True).select_related('oficina').first()
    if not persona:
        return None, None
    if not persona.estado_activo:
        return None, None
    return persona.tipo, persona


def _send_whatsapp_message(phone_number: str, text: str) -> bool:
    phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    access_token = settings.WHATSAPP_ACCESS_TOKEN

    if not phone_id or not access_token:
        logger.info('WhatsApp no configurado. Mensaje omitido para %s: %s', phone_number, text)
        return False

    url = f'https://graph.facebook.com/v20.0/{phone_id}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': phone_number,
        'type': 'text',
        'text': {'body': text},
    }

    req = urllib_request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urllib_request.urlopen(req, timeout=15):
            return True
    except urllib_error.HTTPError as exc:
        logger.warning('WhatsApp HTTPError %s al enviar mensaje: %s', exc.code, exc.read())
    except Exception as exc:
        logger.warning('Error enviando WhatsApp: %s', exc)
    return False


def _create_public_ticket(data: dict) -> Ticket:
    correo = (data.get('email') or '').strip() or 'noreply@local'
    telefono = (data.get('phone') or '').strip()
    identificacion = (data.get('personId') or '').strip()
    office_code = _parse_office_code(data.get('officeCode') or data.get('dependencia') or '')
    equipment_serial = (data.get('equipmentSerial') or '').strip()

    person_kind, person = _get_active_person_by_identification(identificacion)
    if not person:
        raise ValidationError({'personId': 'del usuario no existe contactate con administracion'})
    # Funcionario o contratista: _get_active_person_by_identification ya exige activo + vigente (fechas si aplica).

    oficina = person.oficina
    if office_code and office_code != oficina.codigo.lower():
        raise ValidationError({'officeCode': 'La oficina del QR no coincide con la cédula registrada.'})

    solicitante_correo = correo if correo != 'noreply@local' else (person.correo or 'noreply@local')
    solicitante_telefono = telefono or person.telefono

    office_equipment = None
    equipo = None
    equipment_type = (data.get('equipmentType') or '').strip()

    if equipment_serial.upper().startswith('OTRO:'):
        personal_serial = equipment_serial.split(':', 1)[1].strip()
        if not personal_serial:
            raise ValidationError({'equipmentSerial': 'Debes indicar el serial del equipo personal.'})

        equipo = Equipo.objects.filter(
            serie__iexact=personal_serial,
            tipo__iexact=equipment_type,
        ).first()
        if not equipo:
            equipo = Equipo.objects.create(
                tipo=equipment_type or 'Equipo personal',
                serie=personal_serial,
                marca='PERSONAL',
                modelo='PERSONAL',
            )

    if not equipo and equipment_serial:
        office_equipment = (
            OficinaEquipo.objects
            .select_related('equipo')
            .filter(oficina=oficina, equipo__serie__iexact=equipment_serial, activo=True)
            .first()
        )
        if not office_equipment:
            raise ValidationError({'equipmentSerial': 'El serial no está registrado en la oficina seleccionada.'})
        equipo = office_equipment.equipo

    if not equipo:
        office_equipment = (
            OficinaEquipo.objects
            .select_related('equipo')
            .filter(oficina=oficina, equipo__tipo__iexact=equipment_type, activo=True)
            .order_by('equipo__serie')
            .first()
        )
        if office_equipment:
            equipo = office_equipment.equipo
        else:
            raise ValidationError({'equipmentType': 'Ese equipo no está asignado a la oficina seleccionada.'})

    # Cédula canónica (registro en Persona) para guardar y para reglas en SolicitarTicketSerializer.validate
    canon_identificacion = (person.identificacion or identificacion).strip() or identificacion.strip()

    ticket = Ticket.objects.create(
        solicitante_nombre=person.nombre,
        solicitante_identificacion=canon_identificacion,
        solicitante_correo=solicitante_correo,
        solicitante_telefono=solicitante_telefono,
        equipo=equipo,
        oficina=oficina,
        oficina_equipo=office_equipment,
        descripcion=data['description'],
        tipo_dano=_normalize_damage_type(data['damageType']),
        estado='ABIERTO',
        formato_servicio={
            'dependencia': oficina.nombre,
            'office_code': oficina.codigo,
            'person_type': person_kind,
            'equipment_serial': equipo.serie,
            'equipment_model': equipo.modelo,
            'equipment_personal': str(office_equipment is None).lower(),
        },
    )

    archivo_pdf = generar_pdf_ticket(ticket)
    # Confirmación al solicitante: usa el correo del formulario o el de la ficha (Persona).
    if is_valid_notification_email(ticket.solicitante_correo):
        try:
            enviar_correo_ticket(
                asunto='📩 Nuevo ticket creado',
                mensaje=(
                    f'Se ha creado un nuevo ticket\n\n'
                    f'ID: {ticket.id}\n'
                    f'Solicitante: {ticket.solicitante_nombre}\n'
                    f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                    f'Estado: {ticket.estado}\n'
                    f'Descripción:\n{ticket.descripcion}\n\n'
                    f'Adjunto encontrarás el PDF con los detalles del ticket.'
                ),
                destinatarios=[ticket.solicitante_correo.strip()],
                archivo_adjunto=archivo_pdf,
            )
        except Exception as e:
            logger.error(f"Failed to send ticket creation email: {e}", exc_info=True)

    return ticket


def _process_whatsapp_conversation(phone_number: str, incoming_text: str):
    text = (incoming_text or '').strip()
    if not text:
        return

    conversation, _ = WhatsAppConversation.objects.get_or_create(phone_number=phone_number)

    if text.lower() in {'hola', 'menu', 'inicio', 'reiniciar'}:
        conversation.step = 'ASK_NAME'
        conversation.data = {}
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Hola. Bienvenido a Oficina TIC. Para crear tu ticket, indícanos tu nombre completo.')
        return

    data = dict(conversation.data or {})

    if conversation.step == 'ASK_NAME':
        data['personName'] = text
        conversation.step = 'ASK_DEPENDENCIA'
        conversation.data = data
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Gracias. Ahora escribe tu número de cédula.')
        return

    if conversation.step == 'ASK_DEPENDENCIA':
        data['personId'] = text
        conversation.step = 'ASK_EQUIPMENT'
        conversation.data = data
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Perfecto. Ahora escribe el código de tu oficina o QR (ejemplo: OFICINA:tic).')
        return

    if conversation.step == 'ASK_EQUIPMENT':
        data['officeCode'] = text
        conversation.step = 'ASK_DAMAGE'
        conversation.data = data
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Indica el tipo de equipo registrado (computador, impresora, tv, celular, etc).')
        return

    if conversation.step == 'ASK_DAMAGE':
        data['equipmentType'] = text
        conversation.step = 'ASK_DESCRIPTION'
        conversation.data = data
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Indica el tipo de daño: Daño físico, Problema en el sistema, Problema de Red, Equipo lento, Problemas de Acceso u Otro.')
        return

    if conversation.step == 'ASK_DESCRIPTION':
        data['damageType'] = text
        conversation.step = 'COMPLETED'
        conversation.data = data
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(phone_number, 'Describe el problema con el mayor detalle posible para finalizar el ticket.')
        return

    if conversation.step == 'COMPLETED':
        data['description'] = text
        data['phone'] = phone_number

        serializer = SolicitarTicketSerializer(data=data)
        if not serializer.is_valid():
            conversation.step = 'ASK_NAME'
            conversation.data = {}
            conversation.save(update_fields=['step', 'data', 'last_message_at'])
            _send_whatsapp_message(phone_number, 'No pudimos crear el ticket por datos incompletos. Escribe "hola" para iniciar nuevamente.')
            return

        ticket = _create_public_ticket(serializer.validated_data)
        conversation.step = 'COMPLETED'
        conversation.data = {}
        conversation.save(update_fields=['step', 'data', 'last_message_at'])
        _send_whatsapp_message(
            phone_number,
            f'Ticket número #{ticket.id} creado correctamente. Te contactaremos pronto. Si deseas crear otro, escribe "hola".',
        )
        return

    conversation.step = 'ASK_NAME'
    conversation.data = {}
    conversation.save(update_fields=['step', 'data', 'last_message_at'])
    _send_whatsapp_message(phone_number, 'Iniciemos de nuevo. Escribe tu nombre completo para crear el ticket.')


class EquipoViewSet(viewsets.ModelViewSet):
    queryset = Equipo.objects.all()
    serializer_class = EquipoSerializer


class OficinaViewSet(viewsets.ModelViewSet):
    queryset = Oficina.objects.all().order_by('nombre')
    serializer_class = OficinaSerializer
    permission_classes = [IsAuthenticated]


class PersonaViewSet(viewsets.ModelViewSet):
    queryset = Persona.objects.select_related('oficina').all().order_by('nombre')
    serializer_class = PersonaSerializer
    permission_classes = [IsAuthenticated]


class OficinaEquipoViewSet(viewsets.ModelViewSet):
    queryset = OficinaEquipo.objects.select_related('oficina', 'equipo', 'persona').all()
    serializer_class = OficinaEquipoSerializer
    permission_classes = [IsAuthenticated]


class SolicitudReactivacionContratistaViewSet(viewsets.ModelViewSet):
    queryset = SolicitudReactivacionContratista.objects.select_related('persona').all()
    serializer_class = SolicitudReactivacionContratistaSerializer
    permission_classes = [IsAuthenticated]


@api_view(['GET'])
@permission_classes([AllowAny])
def oficinas_publicas(request):
    oficinas = Oficina.objects.filter(activa=True).order_by('nombre')
    return Response(OficinaSerializer(oficinas, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def oficina_catalogo(request):
    raw_code = request.query_params.get('qr') or request.query_params.get('officeCode') or ''
    office_code = _parse_office_code(raw_code)
    if not office_code:
        raise ValidationError({'officeCode': 'Debes enviar el código QR de la oficina.'})

    oficina = Oficina.objects.filter(codigo__iexact=office_code, activa=True).first()
    if not oficina:
        raise ValidationError({'officeCode': 'No se encontró una oficina activa con ese QR.'})

    person_id = (request.query_params.get('personId') or '').strip()
    if not person_id:
        return Response({
            'office': OficinaSerializer(oficina).data,
            'people': {'funcionarios': [], 'contratistas': []},
            'equipment': [],
        })

    # Check in the target office first (including inactive records)
    persona_en_oficina = Persona.objects.filter(oficina=oficina, identificacion__iexact=person_id).first()
    if persona_en_oficina:
        if not persona_en_oficina.estado_activo:
            raise ValidationError({'personId': ['DESACTIVADO']})
        persona = persona_en_oficina
    else:
        # Not in this office — check if they belong to another office (active)
        otra_persona = (
            Persona.objects
            .filter(identificacion__iexact=person_id, activo=True)
            .select_related('oficina')
            .first()
        )
        if otra_persona and otra_persona.estado_activo:
            raise ValidationError({'personId': [f'OTRA_OFICINA:{otra_persona.oficina.nombre}']})
        # Exists anywhere but inactive?
        cualquier_persona = Persona.objects.filter(identificacion__iexact=person_id).first()
        if cualquier_persona:
            raise ValidationError({'personId': ['DESACTIVADO']})
        raise ValidationError({'personId': ['NO_ENCONTRADO']})

    inventario = (
        OficinaEquipo.objects
        .select_related('equipo', 'persona')
        .filter(oficina=oficina, activo=True)
        .filter(
            Q(tipo_persona__iexact=persona.tipo)
            | Q(tipo_persona__iexact='SIN_ASIGNAR')
            | Q(persona=persona)
        )
        .order_by('equipo__tipo', 'equipo__serie')
    )

    # Fallback: if no assignment matches the person/type, return active office inventory.
    if not inventario.exists():
        inventario = (
            OficinaEquipo.objects
            .select_related('equipo', 'persona')
            .filter(oficina=oficina, activo=True)
            .order_by('equipo__tipo', 'equipo__serie')
        )

    equipos = []
    for item in inventario:
        equipos.append({
            'id': item.id,
            'tipo': item.equipo.tipo,
            'serie': item.equipo.serie,
            'modelo': item.equipo.modelo,
            'marca': item.equipo.marca,
            'tipo_persona': item.tipo_persona,
            'persona_id': item.persona_id,
        })

    funcionarios = [persona] if persona.tipo == 'FUNCIONARIO' else []
    contratistas = [persona] if persona.tipo == 'CONTRATISTA' else []

    return Response({
        'office': OficinaSerializer(oficina).data,
        'people': {
            'funcionarios': PersonaSerializer(funcionarios, many=True).data,
            'contratistas': PersonaSerializer(contratistas, many=True).data,
        },
        'equipment': equipos,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def oficina_qr_descargar(request, oficina_id: int):
    oficina = get_object_or_404(Oficina, pk=oficina_id)
    req = urllib_request.Request(oficina.qr_image_url, method='GET')
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            content = resp.read()
    except Exception:
        return Response({'detail': 'No se pudo generar el QR en este momento.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    response = HttpResponse(content, content_type='image/png')
    response['Content-Disposition'] = f'attachment; filename="qr_oficina_{oficina.codigo}.png"'
    return response


@api_view(['GET'])
@permission_classes([AllowAny])
def oficina_sticker_descargar(request, oficina_id: int):
    oficina = get_object_or_404(Oficina, pk=oficina_id)
    try:
        content = generar_sticker_oficina_png(oficina)
    except Exception:
        return Response({'detail': 'No se pudo generar el sticker en este momento.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    response = HttpResponse(content, content_type='image/png')
    response['Content-Disposition'] = f'attachment; filename="sticker_oficina_{oficina.codigo}.png"'
    return response


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

        # Enviar correo con PDF al solicitante solo si hay correo válido guardado
        if is_valid_notification_email(ticket.solicitante_correo):
            enviar_correo_ticket(
                asunto='📩 Nuevo ticket creado',
                mensaje=(
                    f'Se ha creado un nuevo ticket\n\n'
                    f'ID: {ticket.id}\n'
                    f'Solicitante: {ticket.solicitante_nombre}\n'
                    f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                    f'Estado: {ticket.estado}\n'
                    f'Descripción:\n{ticket.descripcion}\n\n'
                    f'Adjunto encontrarás el PDF con los detalles del ticket.'
                ),
                destinatarios=[ticket.solicitante_correo.strip()],
                archivo_adjunto=archivo_pdf,
            )

    def perform_update(self, serializer):
        instance = serializer.instance

        # Si el ticket tiene una asignacion activa, solo el tecnico asignado
        # (o un admin) puede modificarlo/resolverlo.
        active_assignment = (
            AsignacionTarea.objects.filter(ticket=instance)
            .exclude(estado='FINALIZADA')
            .order_by('-fecha_asignacion')
            .first()
        )

        request_user = getattr(self.request, 'user', None)
        if active_assignment and request_user and request_user.is_authenticated:
            is_admin = request_user.is_staff or request_user.is_superuser
            is_assigned_technician = active_assignment.usuario_asignado_id == request_user.id

            if not is_admin and not is_assigned_technician:
                raise PermissionDenied(
                    f'Este ticket ya esta asignado a {active_assignment.usuario_asignado.username}. '
                    'No puedes resolverlo.'
                )

        previous_estado = serializer.instance.estado
        ticket = serializer.save()

        # Sincronizar datos del equipo desde la ficha técnica (formato_servicio)
        # para que el módulo de Equipos del admin refleje la serie/modelo capturados.
        try:
            formato = ticket.formato_servicio if isinstance(ticket.formato_servicio, dict) else {}
            serial_form = (formato.get('serial') or '').strip()
            modelo_form = (formato.get('modelo') or '').strip()

            equipo_updates = []
            if serial_form and ticket.equipo.serie != serial_form:
                ticket.equipo.serie = serial_form
                equipo_updates.append('serie')

            if modelo_form and ticket.equipo.modelo != modelo_form:
                ticket.equipo.modelo = modelo_form
                equipo_updates.append('modelo')

            if equipo_updates:
                ticket.equipo.save(update_fields=equipo_updates)
        except Exception as e:
            logger.warning(f"Failed to update equipment fields: {e}")

        # Atendido_por: usar siempre el usuario autenticado para estadísticas reales.
        # Nunca confiar en valores enviados por el frontend para este campo.
        try:
            nombre = ''
            if getattr(self.request, 'user', None) and self.request.user.is_authenticated:
                nombre = self.request.user.get_full_name() or self.request.user.username or ''

            if nombre:
                ticket.atendido_por = nombre
                ticket.save(update_fields=['atendido_por'])
        except Exception as e:
            logger.warning(f"Failed to set atendido_por: {e}")

        if previous_estado != 'CERRADO' and ticket.estado == 'CERRADO':
            formato = ticket.formato_servicio if isinstance(ticket.formato_servicio, dict) else {}
            insumos = formato.get('insumos') or []
            if isinstance(insumos, list):
                for item in insumos:
                    try:
                        stock_id = int(item.get('stock_id'))
                        cantidad = int(item.get('cantidad'))
                    except Exception:
                        continue
                    if stock_id <= 0 or cantidad <= 0:
                        continue
                    stock = StockInventario.objects.filter(pk=stock_id, activo=True).first()
                    if not stock:
                        continue
                    SalidaInventario.objects.create(
                        stock=stock,
                        ticket=ticket,
                        cantidad=cantidad,
                        motivo='INSTALACION',
                        oficina_destino=ticket.oficina,
                        tecnico_responsable=self.request.user if self.request.user.is_authenticated else None,
                        registrado_por=self.request.user if self.request.user.is_authenticated else None,
                        generar_acta=False,
                        observaciones=f'Consumo en ticket #{ticket.id}',
                    )

            # Guardar fecha real de cierre para estadísticas diarias confiables
            try:
                formato = dict(ticket.formato_servicio or {})
                formato['fecha_cierre'] = timezone.now().isoformat()
                ticket.formato_servicio = formato
                ticket.save(update_fields=['formato_servicio'])
            except Exception as e:
                logger.warning(f"Failed to set fecha_cierre: {e}")

            # Si se cierra el ticket desde este endpoint, finalizar asignaciones activas
            # para que las estadísticas por técnico y por día se actualicen correctamente.
            AsignacionTarea.objects.filter(ticket=ticket).exclude(estado='FINALIZADA').update(
                estado='FINALIZADA',
                fecha_finalizacion=timezone.now(),
            )

            # Mantener ticket bloqueado para evitar reasignaciones posteriores
            if not ticket.asignado:
                ticket.asignado = True
                ticket.save(update_fields=['asignado'])

        if ticket.estado == 'CERRADO':
            # Generar PDF y enviar correo con el documento adjunto
            archivo_pdf = generar_pdf_ticket(ticket)

            if is_valid_notification_email(ticket.solicitante_correo):
                enviar_correo_ticket(
                    asunto='✅ Ticket cerrado',
                    mensaje=(
                        f'El ticket #{ticket.id} ha sido cerrado.\n\n'
                        f'Solicitante: {ticket.solicitante_nombre}\n'
                        f'Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n'
                        f'Atendido por: {getattr(ticket, "atendido_por", "")}\n'
                        f'Estado: {ticket.estado}\n'
                        f'Descripción:\n{ticket.descripcion}\n\n'
                        f'Adjunto encontrarás el PDF con los detalles finales del ticket.'
                    ),
                    destinatarios=[ticket.solicitante_correo.strip()],
                    archivo_adjunto=archivo_pdf,
                )

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def pdf(self, request, pk=None):
        """Descargar PDF del ticket (o TXT de respaldo si ReportLab falló al generar)."""
        try:
            ticket = self.get_object()

            ruta = Path(generar_pdf_ticket(ticket))
            if not ruta.is_file():
                return Response(
                    {'error': 'Documento no encontrado'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            suffix = ruta.suffix.lower()
            inline = request.query_params.get('inline') in ('1', 'true', 'yes')

            if suffix == '.pdf':
                content_type = 'application/pdf'
                if ticket.numero_ficha_tecnica:
                    filename = 'ficha_tecnica.pdf'
                else:
                    filename = f'ficha_tecnica_borrador_{ticket.id}.pdf'
            else:
                content_type = 'text/plain; charset=utf-8'
                filename = f'ficha_tecnica_ticket_{ticket.id}.txt'

            return FileResponse(
                ruta.open('rb'),
                as_attachment=not inline,
                filename=filename,
                content_type=content_type,
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

    def _ensure_assignment_owner_or_staff(self, asignacion):
        """
        Solo el usuario asignado o un admin puede tomar/editar esta tarea.
        """
        request_user = getattr(self.request, 'user', None)
        if not request_user or not request_user.is_authenticated:
            raise PermissionDenied('Debes iniciar sesion para gestionar tareas.')

        if request_user.is_staff or request_user.is_superuser:
            return

        if asignacion.usuario_asignado_id != request_user.id:
            raise PermissionDenied(
                f'Este ticket ya esta asignado a {asignacion.usuario_asignado.username}. '
                'No puedes cogerlo.'
            )

    def _handle_deleted_assignment(self, asignacion):
        ticket = asignacion.ticket
        if ticket.estado != 'CERRADO' and ticket.asignado:
            ticket.asignado = False
            ticket.save(update_fields=['asignado'])

    def get_queryset(self):
        """
        Soporta:
        - /tareas/?usuario_id=<id>  (compatibilidad)
        - /tareas/mias/             (recomendado)
        """
        qs = super().get_queryset()

        request_user = self.request.user

        # Seguridad: usuarios no admin solo ven sus tareas.
        if not request_user.is_staff and not request_user.is_superuser:
            return qs.filter(usuario_asignado=request_user).order_by('-fecha_asignacion')

        usuario_id = self.request.query_params.get('usuario_id')
        if usuario_id:
            try:
                return qs.filter(usuario_asignado_id=int(usuario_id)).order_by('-fecha_asignacion')
            except Exception:
                return qs.none()

        return qs.order_by('-fecha_asignacion')

    @action(detail=False, methods=['get'], url_path='mias', permission_classes=[IsAuthenticated])
    def mias(self, request):
        """
        Endpoint recomendado para el panel:
        GET /tareas/mias/
        Devuelve tareas del usuario autenticado (sin pasar usuario_id).
        """
        qs = AsignacionTarea.objects.filter(usuario_asignado=request.user).order_by('-fecha_asignacion')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """Cuando se crea una tarea, registrar quién la asignó y notificar."""
        ticket = serializer.validated_data['ticket']
        if ticket.estado == 'CERRADO':
            from rest_framework.exceptions import ValidationError
            raise ValidationError('No se puede asignar un ticket que ya esta cerrado.')
        if ticket.estado != 'ABIERTO':
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Solo se pueden asignar tickets en estado abierto.')

        if ticket.asignado:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Este ticket ya está asignado a otra persona.")

        request_user = self.request.user
        asignado_por = request_user.username
        if request_user.is_staff or request_user.is_superuser:
            cand = (serializer.validated_data.get('asignado_por') or '').strip()
            if cand and User.objects.filter(username=cand, is_active=True).filter(
                Q(is_staff=True) | Q(is_superuser=True)
            ).exists():
                asignado_por = cand

        asignacion = serializer.save(
            asignado_por=asignado_por,
            estado='PENDIENTE',
        )

        # Marcar el ticket como asignado
        ticket.asignado = True
        ticket.save()

        # 1) Construir mensaje
        message = {
            'message': f'Te ha sido asignado el ticket #{asignacion.ticket_id}',
            'tarea_id': asignacion.id,
            'ticket_id': asignacion.ticket_id,
        }

        # 2) Notificar por Channels a grupos consistentes
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer

            channel_layer = get_channel_layer()

            # Grupo por auth.User
            auth_group = f'user_{asignacion.usuario_asignado.id}'
            async_to_sync(channel_layer.group_send)(auth_group, {
                'type': 'task_assigned',
                'message': message,
            })

            logger.info(f"Asignacion creada id={asignacion.id} -> notify auth_group={auth_group}")
        except Exception as e:
            logger.warning(f"No se pudo notificar por channels: {e}")

        # 3) Enviar correo (si aplica)
        try:
            if is_valid_notification_email(asignacion.usuario_asignado.email):
                plazo_line = ''
                if asignacion.plazo_hasta:
                    plazo_line = (
                        f"\nPlazo de atención (admin): "
                        f"{timezone.localtime(asignacion.plazo_hasta).strftime('%d/%m/%Y %H:%M')}\n"
                    )
                enviar_correo_ticket(
                    asunto='🔔 Tarea asignada',
                    mensaje=(
                        f'Hola {asignacion.usuario_asignado.username},\n\nSe te ha asignado la siguiente tarea:\n'
                        f'Ticket: {asignacion.ticket.equipo.tipo} - {asignacion.ticket.equipo.serie}\n'
                        f'ID Tarea: {asignacion.id}\n'
                        f'Prioridad: {asignacion.get_prioridad_display()}\n'
                        f'{plazo_line}\n'
                        f'Por favor revisa el sistema para más detalles.'
                    ),
                    destinatarios=[asignacion.usuario_asignado.email],
                )
        except Exception:
            pass

        return asignacion

    def perform_update(self, serializer):
        """Cuando se actualiza una tarea, cerrar el ticket solo al terminar y mantenerlo bloqueado."""
        instance = serializer.instance
        self._ensure_assignment_owner_or_staff(instance)
        old_estado = instance.estado
        asignacion = serializer.save()

        ticket = asignacion.ticket

        if old_estado != asignacion.estado:
            # El ticket pasa a EN_PROCESO solo cuando el técnico lo indica vía API de ticket
            # (no al poner la tarea en EN_PROCESO), para que siga «pendiente» hasta que lo tome.
            if asignacion.estado == 'FINALIZADA':
                updates = []
                if old_estado != 'FINALIZADA':
                    asignacion.fecha_finalizacion = timezone.now()
                    asignacion.save(update_fields=['fecha_finalizacion'])
                if ticket.estado != 'CERRADO':
                    ticket.estado = 'CERRADO'
                    updates.append('estado')

                # Registrar técnico que cerró la tarea para que cuente en estadísticas.
                nombre = ''
                if getattr(self.request, 'user', None) and self.request.user.is_authenticated:
                    nombre = self.request.user.get_full_name() or self.request.user.username or ''
                if nombre and ticket.atendido_por != nombre:
                    ticket.atendido_por = nombre
                    updates.append('atendido_por')

                # Persistir fecha real de cierre del ticket.
                try:
                    formato = dict(ticket.formato_servicio or {})
                    formato['fecha_cierre'] = timezone.now().isoformat()
                    ticket.formato_servicio = formato
                    updates.append('formato_servicio')
                except Exception:
                    pass

                if not ticket.asignado:
                    ticket.asignado = True
                    updates.append('asignado')
                if updates:
                    ticket.save(update_fields=updates)

        # Si la tarea se marca como FINALIZADA, notificar al asignador.
        if old_estado != 'FINALIZADA' and asignacion.estado == 'FINALIZADA':
            # Notificar por Channels
            try:
                from asgiref.sync import async_to_sync
                from channels.layers import get_channel_layer

                channel_layer = get_channel_layer()
                message = {
                    'message': f'La tarea del ticket #{asignacion.ticket_id} ha sido completada.',
                    'tarea_id': asignacion.id,
                    'ticket_id': asignacion.ticket_id,
                }

                # Notificar al asignador (admin que creó la tarea)
                try:
                    asignador_user = User.objects.filter(username=asignacion.asignado_por).first()
                    if asignador_user:
                        auth_group = f'user_{asignador_user.id}'
                        async_to_sync(channel_layer.group_send)(auth_group, {
                            'type': 'task_completed',
                            'message': message,
                        })
                except Exception:
                    pass

            except Exception as e:
                logger.warning(f"No se pudo notificar completada por channels: {e}")

        return asignacion

    def perform_destroy(self, instance):
        self._ensure_assignment_owner_or_staff(instance)
        self._handle_deleted_assignment(instance)
        instance.delete()


def _user_can_access_ticket_chat(user, ticket):
    if not user or not user.is_authenticated:
        return False

    if user.is_staff or user.is_superuser:
        return True

    return AsignacionTarea.objects.filter(ticket=ticket, usuario_asignado=user).exists()


class TicketMessageViewSet(viewsets.GenericViewSet):
    serializer_class = TicketMessageSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, SessionAuthentication]

    def _get_ticket(self):
        ticket_id = self.request.query_params.get('ticket_id') or self.request.data.get('ticket')
        if not ticket_id:
            raise ValidationError({'ticket': 'Debes enviar ticket_id en la query o ticket en el cuerpo.'})

        ticket = Ticket.objects.filter(pk=ticket_id).first()
        if not ticket:
            raise ValidationError({'ticket': 'Ticket no encontrado.'})

        if not _user_can_access_ticket_chat(self.request.user, ticket):
            raise PermissionDenied('No tienes permisos para ver o enviar mensajes en este ticket.')

        return ticket

    def get_queryset(self):
        ticket = self._get_ticket()
        return TicketMessage.objects.filter(ticket=ticket).select_related('sender').order_by('created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        ticket = self._get_ticket()
        message = (request.data.get('message') or '').strip()
        if not message:
            raise ValidationError({'message': 'El mensaje no puede estar vacío.'})

        if len(message) > 2000:
            raise ValidationError({'message': 'El mensaje supera el límite de 2000 caracteres.'})

        chat_message = TicketMessage.objects.create(
            ticket=ticket,
            sender=request.user,
            message=message,
        )
        payload = TicketMessageSerializer(chat_message).data

        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'ticket_chat_{ticket.id}',
                {
                    'type': 'chat_message',
                    'payload': payload,
                },
            )
        except Exception as exc:
            logger.warning('No se pudo emitir mensaje de chat por WebSocket: %s', exc)

        try:
            notify_ticket_chat_message(ticket, request.user, message)
        except Exception:
            logger.exception('Fallo notificación por correo de chat ticket #%s', ticket.id)

        return Response(payload, status=status.HTTP_201_CREATED)


class InternalMessageViewSet(viewsets.GenericViewSet):
    serializer_class = InternalMessageSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, SessionAuthentication]

    def _get_peer_user(self):
        peer_user_id = self.request.query_params.get('peer_user_id') or self.request.data.get('recipient')
        if not peer_user_id:
            raise ValidationError({'peer_user_id': 'Debes enviar peer_user_id en la query o recipient en el cuerpo.'})

        peer = User.objects.filter(pk=peer_user_id, is_active=True).first()
        if not peer:
            raise ValidationError({'peer_user_id': 'Usuario destino no encontrado.'})

        if peer.id == self.request.user.id:
            raise ValidationError({'peer_user_id': 'No puedes abrir una conversación contigo mismo.'})

        return peer

    def get_queryset(self):
        peer = self._get_peer_user()
        current_user = self.request.user
        return InternalMessage.objects.filter(
            Q(sender=current_user, recipient=peer) |
            Q(sender=peer, recipient=current_user)
        ).select_related('sender', 'recipient').order_by('created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        peer = self._get_peer_user()
        message = (request.data.get('message') or '').strip()

        if not message:
            raise ValidationError({'message': 'El mensaje no puede estar vacío.'})

        if len(message) > 2000:
            raise ValidationError({'message': 'El mensaje supera el límite de 2000 caracteres.'})

        internal_message = InternalMessage.objects.create(
            sender=request.user,
            recipient=peer,
            message=message,
        )
        payload = InternalMessageSerializer(internal_message).data

        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer

            channel_layer = get_channel_layer()
            for user_id in {request.user.id, peer.id}:
                async_to_sync(channel_layer.group_send)(
                    f'user_{user_id}',
                    {
                        'type': 'internal_message',
                        'payload': payload,
                    },
                )
        except Exception as exc:
            logger.warning('No se pudo emitir mensaje interno por WebSocket: %s', exc)

        try:
            notify_internal_message(request.user, peer, message)
        except Exception:
            logger.exception('Fallo notificación por correo de mensaje interno')

        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='inbox')
    def inbox(self, request):
        """Mensajes recibidos (para bandeja / notificaciones), sin peer_user_id."""
        qs = (
            InternalMessage.objects.filter(recipient=request.user)
            .select_related('sender', 'recipient')
            .order_by('-created_at')[:200]
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_users(request):
    users = (
        User.objects.filter(is_active=True)
        .exclude(id=request.user.id)
        .order_by('first_name', 'last_name', 'username')
    )

    result = [
        {
            'id': user.id,
            'username': user.username,
            'full_name': user.get_full_name() or user.username,
            'email': user.email or '',
            'is_staff': user.is_staff,
        }
        for user in users
    ]
    return Response(result)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stats(request):
    """Estadísticas para el dashboard técnico."""
    try:
        from collections import defaultdict
        from django.db.models import Count, Q
        from django.db.models.functions import TruncDate

        pending = Ticket.objects.filter(estado='ABIERTO').count()
        in_process = Ticket.objects.filter(estado='EN_PROCESO').count()
        closed = Ticket.objects.filter(estado='CERRADO').count()
        total = Ticket.objects.count()

        now = timezone.now()
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        tech_qs = User.objects.filter(
            is_active=True,
            is_staff=False,
            is_superuser=False,
        ).order_by('username')
        technicians = [u.get_full_name() or u.username for u in tech_qs]

        # Rendimiento por técnico (atendido_por)
        per_tech = (
            Ticket.objects.filter(estado='CERRADO')
            .exclude(atendido_por__isnull=True)
            .exclude(atendido_por='')
            .values('atendido_por')
            .annotate(count=Count('id'))
        )
        technician_performance = {name: 0 for name in technicians}
        technician_performance.update({r['atendido_por']: r['count'] for r in per_tech})

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

        # Contar TICKETS CERRADOS directamente (incluye asignados + resueltos por cuenta propia)
        closed_tickets = Ticket.objects.filter(
            estado='CERRADO',
            atendido_por__isnull=False,
        ).exclude(
            atendido_por__exact=''
        )

        def _resolved_at(ticket_obj):
            # 1) Fecha de cierre persistida al cerrar ticket.
            cierre = (ticket_obj.formato_servicio or {}).get('fecha_cierre') if isinstance(ticket_obj.formato_servicio, dict) else None
            if cierre:
                try:
                    normalized = str(cierre).replace('Z', '+00:00')
                    parsed = datetime.fromisoformat(normalized)
                    if timezone.is_naive(parsed):
                        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                    return parsed
                except Exception:
                    pass

            # 2) Fecha de finalización de asignación (si vino por tarea asignada).
            asignacion_final = (
                AsignacionTarea.objects.filter(ticket=ticket_obj, estado='FINALIZADA', fecha_finalizacion__isnull=False)
                .order_by('-fecha_finalizacion')
                .first()
            )
            if asignacion_final and asignacion_final.fecha_finalizacion:
                return asignacion_final.fecha_finalizacion

            # 3) Fallback histórico: fecha de creación.
            return ticket_obj.fecha

        total_by_technician = defaultdict(int)
        daily_totals = defaultdict(int)
        daily_by_technician = defaultdict(lambda: defaultdict(int))
        weekly_stats = defaultdict(lambda: {'completed': 0, 'hours': []})
        monthly_stats = defaultdict(lambda: {'completed': 0, 'hours': []})

        for ticket in closed_tickets:
            technician_name = ticket.atendido_por
            resolved_at = _resolved_at(ticket)

            # Contar total
            total_by_technician[technician_name] += 1

            # Reparaciones por día (últimos 30 días)
            if resolved_at >= month_start:
                day_key = resolved_at.date().isoformat()
                daily_totals[day_key] += 1
                daily_by_technician[day_key][technician_name] += 1

            # Calcular horas de resolución (desde creación del ticket)
            resolution_hours = max(
                (now - ticket.fecha).total_seconds() / 3600,
                0,
            ) if ticket.fecha else 0

            # Eficiencia semanal
            if resolved_at >= week_start:
                weekly_stats[technician_name]['completed'] += 1
                weekly_stats[technician_name]['hours'].append(resolution_hours)

            # Eficiencia mensual
            if resolved_at >= month_start:
                monthly_stats[technician_name]['completed'] += 1
                monthly_stats[technician_name]['hours'].append(resolution_hours)

        def build_efficiency_table(stats_map):
            rows = []
            for technician_name in technicians:
                info = stats_map.get(technician_name, {'completed': 0, 'hours': []})
                completed_count = info['completed']

                avg_hours = (
                    sum(info['hours']) / len(info['hours'])
                    if info['hours']
                    else 0
                )
                efficiency_score = 0 if completed_count == 0 else completed_count if avg_hours == 0 else completed_count / avg_hours

                rows.append({
                    'technician': technician_name,
                    'completedRepairs': completed_count,
                    'averageResolutionHours': round(avg_hours, 2),
                    'efficiencyScore': round(efficiency_score, 2),
                })

            rows.sort(key=lambda item: (-item['completedRepairs'], item['averageResolutionHours']))
            for index, row in enumerate(rows, start=1):
                row['rank'] = index
            return rows

        weekly_efficiency = build_efficiency_table(weekly_stats)
        monthly_efficiency = build_efficiency_table(monthly_stats)

        top_worker = None
        if total_by_technician:
            worker_name, worker_total = max(total_by_technician.items(), key=lambda pair: pair[1])
            top_worker = {
                'name': worker_name,
                'totalRepairs': worker_total,
            }

        repairs_per_day = []
        for day_key in sorted(daily_totals.keys()):
            repairs_per_day.append({
                'date': day_key,
                'totalRepairs': daily_totals[day_key],
                'byTechnician': dict(sorted(daily_by_technician[day_key].items())),
            })

        # Reparaciones del usuario autenticado hoy (fiable, calculado en el servidor)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        current_user_display = request.user.get_full_name() or request.user.username or ''
        current_user_names = {
            (request.user.get_full_name() or '').strip(),
            (request.user.username or '').strip(),
        }
        current_user_names = {name for name in current_user_names if name}
        my_repairs_today = 0
        if current_user_display and current_user_names:
            own_tickets_filter = Q()
            for name in current_user_names:
                own_tickets_filter |= Q(atendido_por__iexact=name)

            my_closed_tickets = Ticket.objects.filter(
                estado='CERRADO',
            ).filter(own_tickets_filter)
            my_repairs_today = sum(1 for ticket in my_closed_tickets if _resolved_at(ticket) >= today_start)

        today_key = now.date().isoformat()
        total_repairs_today = daily_totals.get(today_key, 0)

        def daily_totals_for(queryset, field_name):
            rows = (
                queryset.exclude(**{f'{field_name}__isnull': True})
                .annotate(day=TruncDate(field_name))
                .values('day')
                .annotate(total=Count('id'))
            )
            return {r['day'].isoformat(): r['total'] for r in rows if r.get('day')}

        tickets_created_daily = daily_totals_for(Ticket.objects.all(), 'fecha')
        tickets_closed_daily = daily_totals_for(Ticket.objects.filter(estado='CERRADO'), 'fecha')
        assignments_created_daily = daily_totals_for(AsignacionTarea.objects.all(), 'fecha_asignacion')
        assignments_completed_daily = daily_totals_for(
            AsignacionTarea.objects.filter(estado='FINALIZADA'),
            'fecha_finalizacion',
        )
        users_created_daily = daily_totals_for(User.objects.all(), 'date_joined')
        equipment_created_daily = daily_totals_for(Equipo.objects.all(), 'fecha_registro')

        all_dates = sorted(
            set(tickets_created_daily.keys())
            | set(tickets_closed_daily.keys())
            | set(assignments_created_daily.keys())
            | set(assignments_completed_daily.keys())
            | set(users_created_daily.keys())
            | set(equipment_created_daily.keys()),
            reverse=True,
        )

        daily_archive = [
            {
                'date': day_key,
                'tickets': {
                    'created': tickets_created_daily.get(day_key, 0),
                    'closed': tickets_closed_daily.get(day_key, 0),
                },
                'assignments': {
                    'created': assignments_created_daily.get(day_key, 0),
                    'completed': assignments_completed_daily.get(day_key, 0),
                },
                'users': users_created_daily.get(day_key, 0),
                'equipment': equipment_created_daily.get(day_key, 0),
                'repairs': daily_totals.get(day_key, 0),
            }
            for day_key in all_dates
        ]

        today_overview = next((item for item in daily_archive if item['date'] == today_key), {
            'date': today_key,
            'tickets': {'created': 0, 'closed': 0},
            'assignments': {'created': 0, 'completed': 0},
            'users': 0,
            'equipment': 0,
            'repairs': 0,
        })
        history_overview = [item for item in daily_archive if item['date'] != today_key]

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
            'topWorker': top_worker,
            'repairsPerDay': repairs_per_day,
            'weeklyEfficiency': weekly_efficiency,
            'monthlyEfficiency': monthly_efficiency,
            'myRepairsToday': my_repairs_today,
            'totalRepairsToday': total_repairs_today,
            'dailyOverview': {
                'today': today_overview,
                'history': history_overview,
            },
            'generatedAt': now.isoformat(),
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
@ratelimit(key='ip', rate='5/m', method='POST', block=True)
def solicitar(request):
    """Crear ticket desde formulario público (personName, personId, equipmentType, damageType, description, email?, phone?)."""
    ser = SolicitarTicketSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        ticket = _create_public_ticket(ser.validated_data)
    except ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    return Response({'ticketId': ticket.id}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@ratelimit(key='ip', rate='3/m', method='POST', block=True)
def mascota_feedback(request):
    ser = MascotaFeedbackSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    ser.save()
    return Response({'ok': True, 'message': 'Gracias por tu sugerencia.'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@ratelimit(key='ip', rate='2/h', method='POST', block=True)
def solicitar_reactivacion_contratista(request):
    identificacion = (request.data.get('identificacion') or '').strip()
    motivo = (request.data.get('motivo') or '').strip()

    if not identificacion:
        return Response({'identificacion': ['La identificación es obligatoria.']}, status=status.HTTP_400_BAD_REQUEST)
    if not motivo:
        return Response({'motivo': ['El motivo es obligatorio.']}, status=status.HTTP_400_BAD_REQUEST)

    contratista = Persona.objects.filter(identificacion__iexact=identificacion, tipo='CONTRATISTA').first()
    if not contratista:
        return Response({'identificacion': ['No se encontró contratista con esa identificación.']}, status=status.HTTP_404_NOT_FOUND)

    solicitud = SolicitudReactivacionContratista.objects.create(persona=contratista, motivo=motivo)
    return Response(
        {
            'ok': True,
            'message': 'Solicitud registrada. Administración revisará la activación.',
            'requestId': solicitud.id,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def verificar_estado_persona(request):
    """Verifica si una persona existe y su estado (activo, vigente, desactivada)."""
    try:
        # Manejar tanto request.data (DRF) como request.POST (Django) y JSON crudo
        if hasattr(request, 'data') and request.data:
            identificacion = (request.data.get('identificacion') or '').strip()
        else:
            import json
            body = request.body.decode('utf-8') if isinstance(request.body, bytes) else request.body
            data = json.loads(body) if body else {}
            identificacion = (data.get('identificacion') or '').strip()
    except Exception:
        identificacion = ''
    
    if not identificacion:
        return Response(
            {'error': 'Identificación requerida'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    persona = Persona.objects.filter(identificacion__iexact=identificacion).first()
    
    if not persona:
        return Response(
            {
                'existe': False,
                'puede_solicitar_reactivacion': False,
                'mensaje': 'Persona no encontrada en el sistema'
            },
            status=status.HTTP_200_OK
        )
    
    # Verificar estado
    activa = persona.activo
    vigente = persona.vigente
    estado_activo = persona.estado_activo
    
    resultado = {
        'existe': True,
        'identificacion': persona.identificacion,
        'nombre': persona.nombre,
        'tipo': persona.tipo,
        'activa': activa,
        'vigente': vigente,
        'estado_activo': estado_activo,
        'puede_solicitar_reactivacion': (persona.tipo == 'CONTRATISTA') and (not estado_activo),
    }
    
    if not activa:
        resultado['razon_desactivacion'] = 'Usuario marcado como inactivo'
    elif not vigente:
        resultado['razon_desactivacion'] = 'Vigencia vencida (contratista)'

    # Verificar si hay solicitudes previas de reactivación
    solicitud_previa = SolicitudReactivacionContratista.objects.filter(
        persona=persona
    ).order_by('-fecha').first()

    if solicitud_previa:
        resultado['solicitud_previa'] = {
            'estado': solicitud_previa.estado,
            'fecha_solicitud': solicitud_previa.fecha.isoformat(),
            'motivo': solicitud_previa.motivo,
            'fecha_nueva_vigencia': solicitud_previa.fecha_nueva_vigencia.isoformat() if solicitud_previa.fecha_nueva_vigencia else None,
        }

        # Si fue aprobada, reflejar estado activo para el frontend
        if solicitud_previa.estado == 'APROBADA' and solicitud_previa.fecha_nueva_vigencia:
            resultado['estado_activo'] = True
            resultado['activa'] = True
            resultado['vigente'] = True
            resultado['puede_solicitar_reactivacion'] = False
            resultado['mensaje_aprobacion'] = f"Tu solicitud fue aprobada. Tu contrato está vigente hasta {solicitud_previa.fecha_nueva_vigencia.strftime('%d de %B de %Y')}"
    
    return Response(resultado, status=status.HTTP_200_OK)


def _public_ticket_review_dict(ticket: Ticket) -> dict:
    return {
        'ticketId': ticket.id,
        'estado': ticket.estado,
        'fecha_creacion': ticket.fecha.isoformat() if ticket.fecha else '',
        'atendido_por': ticket.atendido_por or '',
        'descripcion': ticket.descripcion,
        'procedimiento': ticket.procedimiento or '',
        'asignado': ticket.asignado,
        'demorado_publico': ticket.demorado_publico,
    }


@api_view(['POST'])
@permission_classes([AllowAny])
@ratelimit(key='ip', rate='12/m', method='POST', block=True)
def revisar_ticket_publico(request):
    """Consulta por cédula; ticketId opcional (si falta, el ticket abierto más reciente de esa cédula)."""
    person_id = (request.data.get('personId') or '').strip()
    ticket_id = request.data.get('ticketId')
    if not person_id:
        return Response({'error': 'personId es obligatorio'}, status=status.HTTP_400_BAD_REQUEST)

    ticket = None
    if ticket_id not in (None, ''):
        try:
            tid = int(ticket_id)
        except (TypeError, ValueError):
            return Response({'error': 'ticketId inválido'}, status=status.HTTP_400_BAD_REQUEST)
        ticket = Ticket.objects.filter(id=tid, solicitante_identificacion__iexact=person_id).first()
    else:
        ticket = (
            Ticket.objects.filter(
                solicitante_identificacion__iexact=person_id,
                estado__in=['ABIERTO', 'EN_PROCESO'],
            )
            .order_by('-fecha')
            .first()
        )

    if not ticket:
        return Response({'error': 'No encontramos un ticket con esos datos'}, status=status.HTTP_404_NOT_FOUND)

    return Response(_public_ticket_review_dict(ticket), status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
@ratelimit(key='ip', rate='8/m', method='POST', block=True)
def solicitar_demora_ticket_publico(request):
    """Solicitante marca demora (sin técnico asignado) tras al menos 1 h; notifica a personal staff."""
    person_id = (request.data.get('personId') or '').strip()
    ticket_id = request.data.get('ticketId')
    if not person_id or ticket_id in (None, ''):
        return Response({'error': 'ticketId y personId son obligatorios'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        tid = int(ticket_id)
    except (TypeError, ValueError):
        return Response({'error': 'ticketId inválido'}, status=status.HTTP_400_BAD_REQUEST)

    ticket = Ticket.objects.select_related('equipo').filter(id=tid, solicitante_identificacion__iexact=person_id).first()
    if not ticket:
        return Response({'error': 'No encontramos un ticket con esos datos'}, status=status.HTTP_404_NOT_FOUND)

    if ticket.estado == 'CERRADO':
        return Response({'error': 'Este ticket ya está cerrado.'}, status=status.HTTP_400_BAD_REQUEST)

    if ticket.asignado:
        return Response({'error': 'El ticket ya tiene técnico asignado.'}, status=status.HTTP_400_BAD_REQUEST)

    if ticket.demorado_publico:
        return Response({'ok': True, 'already': True, **_public_ticket_review_dict(ticket)}, status=status.HTTP_200_OK)

    min_at = ticket.fecha + timedelta(hours=1)
    if timezone.now() < min_at:
        return Response(
            {
                'error': 'Solo puedes avisar demora después de 1 hora desde la creación del ticket.',
                'retry_after': min_at.isoformat(),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    ticket.demorado_publico = True
    fmt = dict(ticket.formato_servicio or {})
    fmt['demora_solicitud_solicitante_en'] = timezone.now().isoformat()
    ticket.formato_servicio = fmt
    ticket.save(update_fields=['demorado_publico', 'formato_servicio'])

    dem_dest = team_emails_for_demora()
    if dem_dest:
        try:
            enviar_correo_ticket(
                asunto=f'⏱️ Demora solicitada — Ticket #{ticket.id}',
                mensaje=(
                    f'El solicitante ({ticket.solicitante_identificacion}) indicó demora: el ticket #{ticket.id} '
                    f'sigue sin técnico asignado tras al menos 1 hora.\n\n'
                    f'Equipo: {ticket.equipo.tipo} — {ticket.equipo.serie}\n'
                    f'Descripción:\n{ticket.descripcion}'
                ),
                destinatarios=dem_dest,
            )
        except Exception:
            logger.exception('Fallo enviando correo de demora ticket %s', ticket.id)
    else:
        logger.warning('Demora ticket #%s: no hay correos de equipo configurados (staff/TICKET_TEAM_NOTIFY_EMAILS).', ticket.id)

    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        text = (
            f'El solicitante del ticket #{ticket.id} reporta demora (sin técnico asignado tras 1 h). '
            f'Asigna el ticket. Equipo: {ticket.equipo.tipo} ({ticket.equipo.serie}).'
        )
        body = {
            'ticket_id': ticket.id,
            'equipo_tipo': ticket.equipo.tipo,
            'equipo_serie': ticket.equipo.serie,
            'solicitante': ticket.solicitante_identificacion,
            'text': text,
        }
        for uid in User.objects.filter(is_active=True, is_staff=True).values_list('id', flat=True):
            async_to_sync(channel_layer.group_send)(
                f'user_{uid}',
                {'type': 'ticket_demora_solicitante', 'message': body},
            )
    except Exception as exc:
        logger.warning('No se pudo notificar demora por WebSocket: %s', exc)

    return Response({'ok': True, 'demorado_publico': True, **_public_ticket_review_dict(ticket)}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def whatsapp_webhook(request):
    if request.method == 'GET':
        mode = request.GET.get('hub.mode')
        token = request.GET.get('hub.verify_token')
        challenge = request.GET.get('hub.challenge', '')

        if mode == 'subscribe' and token == settings.WHATSAPP_VERIFY_TOKEN:
            return HttpResponse(challenge, status=200)
        return HttpResponse('Token de verificación inválido', status=403)

    payload = request.data if isinstance(request.data, dict) else {}
    entries = payload.get('entry', [])

    for entry in entries:
        for change in entry.get('changes', []):
            value = change.get('value', {})
            messages = value.get('messages', [])
            for message in messages:
                phone_number = message.get('from')
                msg_text = (message.get('text') or {}).get('body', '').strip()
                if phone_number and msg_text:
                    _process_whatsapp_conversation(phone_number, msg_text)

    return Response({'status': 'received'}, status=status.HTTP_200_OK)


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
    refresh.access_token['username'] = user.username
    refresh.access_token['email'] = user.email or ''
    refresh.access_token['full_name'] = (user.get_full_name() or '').strip() or user.username
    refresh.access_token['is_staff'] = user.is_staff
    modules = _resolve_user_modules(user)
    refresh.access_token['modules'] = modules
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'username': user.username,
        'full_name': (user.get_full_name() or '').strip() or user.username,
        'is_staff': user.is_staff,
        'modules': modules,
    })


