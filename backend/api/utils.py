from django.core.mail import EmailMessage
import os

def enviar_correo_ticket(asunto, mensaje, destinatarios, archivo_adjunto=None):
    """
    Envía un correo con soporte para adjuntos.
    
    Args:
        asunto (str): Asunto del correo
        mensaje (str): Contenido del correo
        destinatarios (list): Lista de emails destinatarios
        archivo_adjunto (str, optional): Ruta del archivo a adjuntar
    """
    email = EmailMessage(
        subject=asunto,
        body=mensaje,
        from_email=None,
        to=destinatarios,
    )
    
    # Adjuntar archivo si se proporciona
    if archivo_adjunto and os.path.exists(archivo_adjunto):
        email.attach_file(archivo_adjunto)
    
    email.send(fail_silently=True)
