from pathlib import Path
from datetime import datetime


def generar_pdf_ticket(ticket):
    """Genera un PDF (o un .txt de respaldo) para el `ticket` dado.

    Intenta usar reportlab si está disponible; si no, crea un archivo de texto
    en la carpeta `tickets/` para evitar errores de importación y permitir que
    el servidor arranque.
    
    Retorna:
        str: Ruta absoluta del archivo generado (PDF o TXT)
    """
    tickets_dir = Path(__file__).resolve().parent / 'tickets'
    tickets_dir.mkdir(exist_ok=True)

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        from reportlab.pdfbase.pdfmetrics import stringWidth

        path = tickets_dir / f"ticket_{ticket.id}.pdf"
        c = canvas.Canvas(str(path), pagesize=letter)
        width, height = letter
        y = height - 28
        x0 = 30
        usable_w = width - 60

        form = getattr(ticket, 'formato_servicio', {}) or {}

        def pick(key, fallback='-'):
            value = form.get(key)
            if value is None or value == '':
                return fallback
            return str(value)

        def wrap_text(value, font_name='Helvetica-Bold', size=10, max_width=120):
            words = str(value or '-').split()
            if not words:
                return ['-']

            lines = []
            line = ''
            for word in words:
                candidate = f"{line} {word}".strip()
                if stringWidth(candidate, font_name, size) <= max_width:
                    line = candidate
                else:
                    if line:
                        lines.append(line)
                    line = word
            if line:
                lines.append(line)
            return lines

        def draw_cell(x, top_y, w, h, label='', value='', label_size=8, value_size=10, center=False):
            c.rect(x, top_y - h, w, h)

            if label:
                c.setFont('Helvetica-Bold', label_size)
                c.drawString(x + 3, top_y - 9, str(label).upper())

            if value not in (None, ''):
                max_width = w - 8
                lines = wrap_text(value, font_name='Helvetica-Bold', size=value_size, max_width=max_width)
                c.setFont('Helvetica-Bold', value_size)

                if center and len(lines) == 1:
                    text_w = stringWidth(lines[0], 'Helvetica-Bold', value_size)
                    c.drawString(x + (w - text_w) / 2, top_y - h + 6, lines[0])
                else:
                    current_y = top_y - 20 if label else top_y - 13
                    min_y = top_y - h + 4
                    for line in lines:
                        if current_y < min_y:
                            break
                        c.drawString(x + 4, current_y, line)
                        current_y -= 11

        def draw_section_title(title, h=20):
            nonlocal y
            c.setFont('Helvetica-Bold', 10)
            c.rect(x0, y - h, usable_w, h)
            tw = stringWidth(title, 'Helvetica-Bold', 10)
            c.drawString(x0 + (usable_w - tw) / 2, y - 13, title.upper())
            y -= h

        c.setLineWidth(0.9)

        # Header principal con 3 columnas
        header_h = 84
        draw_cell(x0, y, usable_w, header_h)
        left_w = 170
        mid_w = 190
        right_w = usable_w - left_w - mid_w
        draw_cell(x0, y, left_w, header_h)
        draw_cell(x0 + left_w, y, mid_w, header_h)
        draw_cell(x0 + left_w + mid_w, y, right_w, header_h)

        c.setFont('Helvetica-Bold', 20)
        tic_w = stringWidth('TIC', 'Helvetica-Bold', 20)
        c.drawString(x0 + left_w + (mid_w - tic_w) / 2, y - 44, 'TIC')

        # Bloque izquierdo intencionalmente en blanco (sin texto institucional).

        c.setFont('Helvetica-Bold', 10)
        c.drawString(x0 + left_w + mid_w + 10, y - 28, 'ORDENES DE SERVICIO')
        c.drawString(x0 + left_w + mid_w + 10, y - 42, 'EQUIPOS DE COMPUTO')
        c.setFont('Helvetica-Bold', 9)
        codigo_pdf = f"TIC {int(ticket.id):08d}"
        c.drawString(x0 + left_w + mid_w + 45, y - 70, codigo_pdf)
        y -= header_h

        row_h = 28
        draw_section_title('1. Informacion diligenciada por el cliente')
        draw_cell(x0, y, usable_w * 0.58, row_h, 'Dependencia', pick('dependencia'))
        draw_cell(
            x0 + usable_w * 0.58,
            y,
            usable_w * 0.42,
            row_h,
            'Numero del ticket',
            pick('orden_servicio_no', str(ticket.id))
        )
        y -= row_h

        draw_cell(x0, y, usable_w, row_h, 'Solicitante / funcionario', pick('nombre_funcionario', ticket.solicitante_nombre or '-'))
        y -= row_h
        draw_cell(x0, y, usable_w, 72, 'Descripcion inicial', pick('diagnostico_descripcion', ticket.descripcion))
        y -= 72

        draw_section_title('2. Datos del equipo (tecnico)')
        data_h = 24
        draw_cell(x0, y, usable_w * 0.5, data_h, 'Datos del equipo', pick('datos_equipo', ticket.equipo.tipo))
        draw_cell(x0 + usable_w * 0.5, y, usable_w * 0.5, data_h, 'Modelo', pick('modelo', ticket.equipo.modelo if hasattr(ticket.equipo, 'modelo') else '-'))
        y -= data_h
        draw_cell(x0, y, usable_w, data_h, 'Serial', pick('serial', ticket.equipo.serie))
        y -= data_h

        draw_section_title('3. Diagnostico')
        draw_cell(
            x0,
            y,
            usable_w,
            row_h,
            'Quien hizo el soporte',
            pick('soporte_realizo', pick('diagnostico_realizo', getattr(ticket, 'atendido_por', '') or '-')),
        )
        y -= row_h

        draw_section_title('4. Soporte realizado')
        draw_cell(x0, y, usable_w * 0.3, row_h, 'Fecha', pick('fecha', datetime.now().strftime('%Y-%m-%d')))
        draw_cell(x0 + usable_w * 0.3, y, usable_w * 0.7, row_h, 'Realizo', pick('soporte_realizo', getattr(ticket, 'atendido_por', '') or '-'))
        y -= row_h
        draw_cell(x0, y, usable_w, 95, 'Descripcion', pick('soporte_descripcion', getattr(ticket, 'procedimiento', '') or '-'))
        y -= 95

        draw_section_title('5. Recomendaciones adicionales')
        draw_cell(x0, y, usable_w, 82, value=pick('recomendaciones', '-'))
        y -= 82

        # Firma fija institucional
        sign_h = 64
        draw_cell(x0, y, usable_w, sign_h)
        line_y = y - 22
        line_margin = 145
        c.line(x0 + line_margin, line_y, x0 + usable_w - line_margin, line_y)
        c.setFont('Helvetica-Bold', 10)
        name = 'Eduardo Sanchez'
        name_w = stringWidth(name, 'Helvetica-Bold', 10)
        c.drawString(x0 + (usable_w - name_w) / 2, line_y - 14, name)
        c.setFont('Helvetica', 9)
        role = 'Jefe TIC - CC 10000200'
        role_w = stringWidth(role, 'Helvetica', 9)
        c.drawString(x0 + (usable_w - role_w) / 2, line_y - 27, role)

        c.save()
        return str(path)
    except Exception as e:
        # Fallback simple: escribir un .txt para no romper el flujo
        path = tickets_dir / f"ticket_{ticket.id}.txt"
        with open(path, 'w', encoding='utf-8') as f:
            f.write(f"Ticket #{ticket.id}\n")
            f.write(f"Solicitante: {ticket.solicitante_nombre or '-'}\n")
            f.write(f"Equipo: {ticket.equipo.tipo} - {ticket.equipo.serie}\n")
            f.write(f"Estado: {ticket.estado}\n")
            f.write(f"Atendido por: {getattr(ticket, 'atendido_por', '') or '-'}\n")
            f.write(f"Tipo daño: {getattr(ticket, 'tipo_dano', '') or '-'}\n")
            f.write(f"Descripción:\n{ticket.descripcion}\n")
            proc = getattr(ticket, 'procedimiento', '') or ''
            if proc:
                f.write(f"Procedimiento:\n{proc}\n")
        return str(path)
