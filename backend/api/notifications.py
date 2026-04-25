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
from django.conf import settings
from django.contrib.auth import get_user_model

from .utils import enviar_correo_ticket

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
    - correos extra en TICKET_TEAM_NOTIFY_EMAILS
    - si no hay ninguno, staff con email (para que no quede sin aviso)
    """
    merged: list[str] = []
    merged.extend(technician_pool_emails())
    merged.extend(_extra_team_emails())
    merged = list(dict.fromkeys([e for e in merged if is_valid_notification_email(e)]))
    if merged:
        return merged
    return staff_pool_emails()


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
        enviar_correo_ticket(
            asunto=f"Mensaje interno de {name}",
            mensaje=(
                f"{name} te envió un mensaje en el chat interno del sistema.\n\n"
                f"Mensaje:\n{preview}\n\n"
                f"Inicia sesión en el portal técnico para responder."
            ),
            destinatarios=[_norm_email(recipient.email)],
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
