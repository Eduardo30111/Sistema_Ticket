"""
Correos de notificación (operación TIC).

Usa el correo que el administrador guarda en:
- Usuario Django (técnicos / staff): `User.email`
- Funcionario/contratista: `Persona.correo` (vía `Ticket.solicitante_correo` al crear ticket público)

Variables de entorno opcionales:
- TICKET_TEAM_NOTIFY_EMAILS: lista separada por comas con correos extra para nuevos tickets y demoras.
"""
from __future__ import annotations

import logging
from io import BytesIO
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from PIL import Image

from .sticker_generator import generar_sticker_oficina_png
from .utils import build_email_html, enviar_correo_ticket

logger = logging.getLogger(__name__)


def _norm_email(value: str | None) -> str:
    return (value or "").strip()


def is_valid_notification_email(email: str | None) -> bool:
    e = _norm_email(email).lower()
    if not e or "@" not in e:
        return False
    if e in {"noreply@local", "noreply@localhost"}:
        return False
    return True


def _extra_team_emails() -> list[str]:
    raw = getattr(settings, "TICKET_TEAM_NOTIFY_EMAILS", None) or []
    out: list[str] = []
    for item in raw:
        if is_valid_notification_email(item):
            out.append(_norm_email(item))
    return list(dict.fromkeys(out))


def technician_pool_emails() -> list[str]:
    """Correos de usuarios técnicos (no staff) activos con email válido."""
    User = get_user_model()
    qs = (
        User.objects.filter(is_active=True, is_staff=False, is_superuser=False)
        .exclude(email__isnull=True)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    emails = [_norm_email(e) for e in qs if is_valid_notification_email(e)]
    return list(dict.fromkeys(emails))


def staff_pool_emails() -> list[str]:
    """Correos de usuarios staff activos (mesa / administración)."""
    User = get_user_model()
    qs = (
        User.objects.filter(is_active=True)
        .filter(is_staff=True)
        .exclude(email__isnull=True)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    emails = [_norm_email(e) for e in qs if is_valid_notification_email(e)]
    return list(dict.fromkeys(emails))


def team_emails_for_new_ticket() -> list[str]:
    """
    Quién recibe aviso de nuevo ticket en cola:
    - técnicos (User no staff) con email
    - staff/admin con email
    - correos extra en TICKET_TEAM_NOTIFY_EMAILS
    """
    merged: list[str] = []
    merged.extend(technician_pool_emails())
    merged.extend(staff_pool_emails())
    merged.extend(_extra_team_emails())
    return list(dict.fromkeys([e for e in merged if is_valid_notification_email(e)]))


def team_emails_for_demora() -> list[str]:
    """Destinatarios de alerta de demora pública (sin técnico asignado)."""
    merged = list(dict.fromkeys(_extra_team_emails() + staff_pool_emails()))
    if merged:
        return merged
    return technician_pool_emails()


def notify_new_ticket_to_team(ticket) -> None:
    """Aviso a mesa técnica de que hay un ticket nuevo."""
    dest = team_emails_for_new_ticket()
    if not dest:
        logger.info("Nuevo ticket #%s: sin destinatarios de equipo configurados (emails).", ticket.id)
        return
    try:
        enviar_correo_ticket(
            asunto=f"Nuevo ticket #{ticket.id} en cola",
            mensaje=(
                f"Hay un ticket nuevo pendiente de asignación o atención.\n\n"
                f"ID: {ticket.id}\n"
                f"Solicitante: {ticket.solicitante_nombre} ({ticket.solicitante_identificacion})\n"
                f"Equipo: {ticket.equipo.tipo} — {ticket.equipo.serie}\n"
                f"Oficina: {getattr(ticket.oficina, 'nombre', '') or '-'}\n"
                f"Estado: {ticket.estado}\n\n"
                f"Descripción:\n{ticket.descripcion}\n"
            ),
            destinatarios=dest,
        )
    except Exception:
        logger.exception("Fallo enviando correo de nuevo ticket #%s al equipo", ticket.id)


def notify_internal_message(sender, recipient, message_text: str) -> None:
    if not is_valid_notification_email(recipient.email):
        return
    preview = (message_text or "").strip()
    if len(preview) > 800:
        preview = preview[:800] + "…"
    name = (sender.get_full_name() or "").strip() or sender.username
    try:
        asunto = f"Mensaje interno de {name}"
        cuerpo = (
            f"{name} te envió un mensaje en el chat interno del sistema.\n\n"
            f"Mensaje:\n{preview}\n\n"
            f"Inicia sesión en el portal técnico para responder."
        )
        enviar_correo_ticket(
            asunto=asunto,
            mensaje=cuerpo,
            destinatarios=[_norm_email(recipient.email)],
            html_message=build_email_html(asunto, cuerpo, variant='internal_message'),
        )
    except Exception:
        logger.exception("Fallo enviando correo de mensaje interno a %s", recipient.id)


def _ticket_chat_recipient_emails(ticket, sender_id: int) -> list[str]:
    """Usuarios asignados al ticket (tareas activas) + staff, excluyendo al remitente."""
    from .models import AsignacionTarea

    User = get_user_model()
    assignee_ids = (
        AsignacionTarea.objects.filter(ticket=ticket)
        .exclude(estado="FINALIZADA")
        .values_list("usuario_asignado_id", flat=True)
        .distinct()
    )
    users = User.objects.filter(id__in=list(assignee_ids), is_active=True).exclude(id=sender_id)
    emails = [_norm_email(u.email) for u in users if is_valid_notification_email(u.email)]
    staff = User.objects.filter(is_active=True, is_staff=True).exclude(id=sender_id)
    for u in staff:
        if is_valid_notification_email(u.email):
            e = _norm_email(u.email)
            if e not in emails:
                emails.append(e)
    if not emails:
        emails = team_emails_for_new_ticket()
    return list(dict.fromkeys([e for e in emails if is_valid_notification_email(e)]))


def notify_ticket_chat_message(ticket, sender, message_text: str) -> None:
    dest = _ticket_chat_recipient_emails(ticket, sender.id)
    if not dest:
        return
    preview = (message_text or "").strip()
    if len(preview) > 800:
        preview = preview[:800] + "…"
    name = (sender.get_full_name() or "").strip() or sender.username
    try:
        enviar_correo_ticket(
            asunto=f"Nuevo mensaje en ticket #{ticket.id}",
            mensaje=(
                f"{name} escribió en el chat del ticket #{ticket.id}.\n\n"
                f"Equipo: {ticket.equipo.tipo} — {ticket.equipo.serie}\n\n"
                f"Mensaje:\n{preview}\n"
            ),
            destinatarios=dest,
        )
    except Exception:
        logger.exception("Fallo enviando correo de chat de ticket #%s", ticket.id)


def notify_admin_created_user(user, role_label: str) -> None:
    """
    Correo de bienvenida cuando el admin crea un usuario auth.User.
    """
    if not is_valid_notification_email(getattr(user, 'email', None)):
        return
    username = (getattr(user, 'username', '') or '').strip() or 'usuario'
    role = (role_label or '').strip() or 'Usuario'
    full_name = (user.get_full_name() or '').strip() or username
    try:
        enviar_correo_ticket(
            asunto='Cuenta creada en Sistema TIC',
            mensaje=(
                f'Hola {full_name},\n\n'
                f'Tu cuenta fue creada exitosamente en el Sistema TIC.\n\n'
                f'Usuario: {username}\n'
                f'Rol: {role}\n\n'
                f'Ya puedes ingresar al sistema con tus credenciales.'
            ),
            destinatarios=[_norm_email(user.email)],
        )
    except Exception:
        logger.exception('Fallo enviando correo de cuenta creada a user=%s', getattr(user, 'id', None))


def notify_admin_created_persona(persona) -> None:
    """
    Correo de registro a funcionario/contratista con datos y QR de oficina en PNG.
    """
    email = getattr(persona, 'correo', None)
    if not is_valid_notification_email(email):
        return

    oficina = getattr(persona, 'oficina', None)
    office_name = getattr(oficina, 'nombre', '') if oficina else '-'
    office_code = getattr(oficina, 'codigo', '') if oficina else ''
    tipo = (getattr(persona, 'tipo', '') or '').strip().upper()
    tipo_texto = 'Funcionario' if tipo == 'FUNCIONARIO' else 'Contratista'
    fin = getattr(persona, 'fecha_fin', None)
    fin_line = ''
    if tipo == 'CONTRATISTA':
        fin_line = f'Fecha de terminación: {fin.strftime("%d/%m/%Y") if fin else "No definida"}\n'

    subject = 'Registro creado en Sistema TIC'
    body = (
        f'Hola {getattr(persona, "nombre", "")},\n\n'
        f'Tu registro fue creado en el Sistema TIC.\n\n'
        f'Nombre: {getattr(persona, "nombre", "")}\n'
        f'Tipo: {tipo_texto}\n'
        f'{fin_line}'
        f'Oficina: {office_name}\n'
        f'Código de oficina: {office_code or "-"}\n\n'
        f'Adjunto encontrarás el QR de tu oficina en formato PNG.'
    )

    try:
        email_msg = EmailMultiAlternatives(
            subject=subject,
            body=body,
            from_email=None,
            to=[_norm_email(email)],
        )
        email_msg.attach_alternative(build_email_html(subject, body), "text/html")

        # Adjuntar QR PNG generado localmente (sin depender de servicio externo).
        if oficina:
            try:
                qr_png = generar_sticker_oficina_png(oficina)
                base_name = f'qr_oficina_{office_code or "oficina"}'
                email_msg.attach(f'{base_name}.png', qr_png, 'image/png')

                # También adjuntar versión PDF del mismo sticker/QR.
                pdf_buf = BytesIO()
                img = Image.open(BytesIO(qr_png)).convert('RGB')
                img.save(pdf_buf, format='PDF')
                email_msg.attach(f'{base_name}.pdf', pdf_buf.getvalue(), 'application/pdf')
            except Exception:
                logger.exception('Error generando/adjuntando QR PNG/PDF para persona=%s', getattr(persona, 'id', None))

        email_msg.send(fail_silently=True)
    except Exception:
        logger.exception('Fallo enviando correo de registro creado a persona=%s', getattr(persona, 'id', None))


def notify_contractor_expired(persona) -> None:
    """
    Aviso al contratista cuando su perfil se desactiva por fin de contrato.
    """
    email = getattr(persona, 'correo', None)
    if not is_valid_notification_email(email):
        return
    fin = getattr(persona, 'fecha_fin', None)
    fin_text = fin.strftime('%d/%m/%Y') if fin else 'sin fecha definida'
    try:
        enviar_correo_ticket(
            asunto='Perfil desactivado por terminación de contrato',
            mensaje=(
                f'Hola {getattr(persona, "nombre", "")},\n\n'
                f'Tu perfil fue desactivado automáticamente por terminación de contrato.\n'
                f'Fecha de terminación registrada: {fin_text}.\n\n'
                f'Si tu contrato fue renovado, solicita la reactivación a administración.'
            ),
            destinatarios=[_norm_email(email)],
        )
    except Exception:
        logger.exception('Fallo enviando correo de expiración a persona=%s', getattr(persona, 'id', None))


def notify_contractor_renewed_to_admin(persona, renewed_by: str = '') -> None:
    """
    Aviso directo a administradores cuando un contratista es renovado/reactivado.
    """
    recipients = staff_pool_emails()
    if not recipients:
        return
    fin = getattr(persona, 'fecha_fin', None)
    fin_text = fin.strftime('%d/%m/%Y') if fin else 'sin fecha definida'
    who = (renewed_by or '').strip() or 'administración'
    try:
        enviar_correo_ticket(
            asunto='Contratista renovado en Sistema TIC',
            mensaje=(
                f'Se renovó/reactivó un contratista en el sistema.\n\n'
                f'Nombre: {getattr(persona, "nombre", "")}\n'
                f'Documento: {getattr(persona, "identificacion", "")}\n'
                f'Nueva fecha de terminación: {fin_text}\n'
                f'Oficina: {getattr(getattr(persona, "oficina", None), "nombre", "-")}\n'
                f'Gestionado por: {who}'
            ),
            destinatarios=recipients,
        )
    except Exception:
        logger.exception('Fallo enviando aviso de renovación a admins para persona=%s', getattr(persona, 'id', None))
