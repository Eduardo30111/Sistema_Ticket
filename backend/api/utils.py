from html import escape
import os
from django.core.mail import EmailMultiAlternatives


def build_email_html(asunto: str, mensaje: str, variant: str = 'default') -> str:
    safe_subject = escape(asunto or 'Notificación Sistema TIC')
    paragraphs = []
    for block in (mensaje or '').strip().split('\n\n'):
        line = escape(block).replace('\n', '<br>')
        if line:
            paragraphs.append(f'<p style="margin:0 0 12px 0;color:#334155;font-size:14px;line-height:1.6;">{line}</p>')

    body_html = ''.join(paragraphs) or (
        '<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">'
        'Tienes una nueva notificación del Sistema TIC.'
        '</p>'
    )

    if variant == 'internal_message':
        return f"""\
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#111827;border:1px solid #334155;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(90deg,#0ea5e9,#6366f1);padding:14px 20px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#e0f2fe;font-weight:700;">Chat interno</div>
                <div style="font-size:18px;color:#ffffff;font-weight:700;margin-top:4px;">Sistema TIC</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;">
                <h1 style="margin:0 0 14px 0;font-size:20px;color:#e2e8f0;">{safe_subject}</h1>
                <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px 14px 4px 14px;">
                  {body_html.replace('#334155', '#cbd5e1')}
                </div>
                <p style="margin:14px 0 0 0;font-size:12px;color:#94a3b8;">Abre el portal técnico para responder al mensaje.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    return f"""\
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbeafe;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(90deg,#166534,#16a34a);padding:14px 20px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#dcfce7;font-weight:700;">Oficina TIC</div>
                <div style="font-size:18px;color:#ffffff;font-weight:700;margin-top:4px;">Sistema de Tickets</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 20px 8px 20px;">
                <h1 style="margin:0 0 14px 0;font-size:20px;color:#0f172a;">{safe_subject}</h1>
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 20px 20px 20px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;color:#64748b;">
                  Este correo fue generado automáticamente por el Sistema TIC.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def enviar_correo_ticket(asunto, mensaje, destinatarios, archivo_adjunto=None, html_message=None):
    """
    Envía un correo con soporte para adjuntos.
    
    Args:
        asunto (str): Asunto del correo
        mensaje (str): Contenido del correo
        destinatarios (list): Lista de emails destinatarios
        archivo_adjunto (str, optional): Ruta del archivo a adjuntar
    """
    email = EmailMultiAlternatives(
        subject=asunto,
        body=mensaje,
        from_email=None,
        to=destinatarios,
    )
    email.attach_alternative(html_message or build_email_html(asunto, mensaje), "text/html")

    # Adjuntar archivo si se proporciona
    if archivo_adjunto and os.path.exists(archivo_adjunto):
        email.attach_file(archivo_adjunto)
    
    email.send(fail_silently=True)
