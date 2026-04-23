import logging
from pathlib import Path
from datetime import datetime
from xml.sax.saxutils import escape

logger = logging.getLogger(__name__)


def _filas_componentes_stock(ticket):
    """Filas para tabla de inventario: salidas registradas al ticket; si no hay, insumos de la ficha."""
    rows = []
    try:
        from inventario.models import SalidaInventario

        for sal in (
            SalidaInventario.objects.filter(ticket_id=ticket.pk)
            .select_related('stock')
            .order_by('fecha_salida', 'id')
        ):
            st = sal.stock
            prod = ''
            ref = ''
            if st:
                prod = (getattr(st, 'producto', None) or '').strip()
                ref = (
                    (getattr(st, 'referencia_fabricante', None) or '')
                    or (getattr(st, 'codigo_barras', None) or '')
                    or (getattr(st, 'tipo', None) or '')
                ).strip()
            rows.append(
                {
                    'producto': prod or '—',
                    'ref': ref or '—',
                    'cant': str(sal.cantidad),
                    'fecha': sal.fecha_salida.strftime('%Y-%m-%d %H:%M') if sal.fecha_salida else '—',
                }
            )
    except Exception:
        rows = []

    if rows:
        return rows

    form = ticket.formato_servicio if isinstance(getattr(ticket, 'formato_servicio', None), dict) else {}
    ins = form.get('insumos')
    if not isinstance(ins, list):
        return []
    out = []
    for item in ins:
        if not isinstance(item, dict):
            continue
        nombre = str(item.get('nombre') or '').strip()
        cant = item.get('cantidad')
        sid = item.get('stock_id')
        out.append(
            {
                'producto': nombre or '—',
                'ref': f"Stock ID {sid}" if sid else '—',
                'cant': str(cant) if cant is not None else '—',
                'fecha': '—',
            }
        )
    return out


def _ensure_numero_ficha_tecnica(ticket):
    """Asigna consecutivo global solo al cerrar el ticket (documento oficial)."""
    from django.db import transaction

    from .models import ConsecutivoDocumentoTIC, Ticket

    if ticket.estado != 'CERRADO':
        return ticket
    if ticket.numero_ficha_tecnica:
        return ticket
    with transaction.atomic():
        t = Ticket.objects.select_for_update().select_related('equipo', 'oficina').get(pk=ticket.pk)
        if t.numero_ficha_tecnica:
            return t
        if t.estado != 'CERRADO':
            return t
        n = ConsecutivoDocumentoTIC.siguiente()
        Ticket.objects.filter(pk=t.pk, numero_ficha_tecnica__isnull=True).update(numero_ficha_tecnica=n)
        t.refresh_from_db()
        return t


def generar_pdf_ticket(ticket):
    """Genera PDF ficha técnica (ReportLab). Nombre de archivo en disco: ficha_tecnica_<id>.pdf"""
    from .models import Ticket

    ticket = Ticket.objects.select_related('equipo', 'oficina').get(pk=ticket.pk)
    ticket = _ensure_numero_ficha_tecnica(ticket)

    tickets_dir = Path(__file__).resolve().parent / 'tickets'
    tickets_dir.mkdir(exist_ok=True)

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        form = ticket.formato_servicio if isinstance(getattr(ticket, 'formato_servicio', None), dict) else {}

        def pick(key, fallback='-'):
            value = form.get(key)
            if value is None or value == '':
                return fallback
            return str(value)

        def pe(text):
            return escape(str(text if text is not None else ''))

        def pblock(text, style):
            raw = str(text or '').strip()
            if not raw or raw == '-':
                return Paragraph('<i>Sin información</i>', style)
            return Paragraph(pe(raw).replace('\n', '<br/>'), style)

        path = tickets_dir / f'ficha_tecnica_{ticket.id}.pdf'
        doc = SimpleDocTemplate(
            str(path),
            pagesize=letter,
            leftMargin=0.5 * inch,
            rightMargin=0.5 * inch,
            topMargin=0.45 * inch,
            bottomMargin=0.55 * inch,
        )
        full_w = doc.width

        styles = getSampleStyleSheet()
        section_title = ParagraphStyle(
            name='SectionTitle',
            parent=styles['Heading2'],
            fontSize=10,
            textColor=colors.HexColor('#0d3d26'),
            spaceBefore=11,
            spaceAfter=5,
            leading=13,
            fontName='Helvetica-Bold',
        )
        cell_label = ParagraphStyle(
            name='CellLabel',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#2d5a40'),
            leading=10,
            fontName='Helvetica-Bold',
        )
        cell_value = ParagraphStyle(
            name='CellValue',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#1a1a1a'),
            leading=11,
        )
        sign_block = ParagraphStyle(
            name='SignBlock',
            parent=styles['Normal'],
            fontSize=9,
            leading=12,
            alignment=1,
            textColor=colors.HexColor('#1a1a1a'),
        )
        small_footer = ParagraphStyle(
            name='SmallFooter',
            parent=styles['Normal'],
            fontSize=7.5,
            textColor=colors.HexColor('#555555'),
            leading=10,
        )

        brand_dark = colors.HexColor('#0f4a2e')
        brand_mid = colors.HexColor('#1f6d4a')
        accent = colors.HexColor('#c8e6c9')
        stripe = colors.HexColor('#f1f8f4')
        border = colors.HexColor('#7eb89a')

        equipo = ticket.equipo
        modelo_equipo = getattr(equipo, 'modelo', '') or '-'
        tipo_equipo = getattr(equipo, 'tipo', '') or '-'

        solicitante = pick('nombre_funcionario', ticket.solicitante_nombre or '-')
        num_ticket = str(ticket.id)
        orden_no = pick('orden_servicio_no', num_ticket)
        oficina_nombre = ''
        if ticket.oficina_id:
            oficina_nombre = getattr(ticket.oficina, 'nombre', '') or ''

        if ticket.estado == 'CERRADO' and ticket.numero_ficha_tecnica:
            codigo_doc = f'TIC {int(ticket.numero_ficha_tecnica):08d}'
        else:
            codigo_doc = f'PRELIMINAR · TK-{ticket.id}'

        desc_inicial = (ticket.descripcion or '').strip() or '-'
        tipo_dano_txt = (getattr(ticket, 'tipo_dano', None) or '').strip() or '-'

        story = []

        # —— Cabecera estilo guía ——
        ofi_line = f' · Oficina: {pe(oficina_nombre)}' if oficina_nombre else ''
        hdr = Paragraph(
            '<para align="center">'
            '<b><font size="9" color="#d4edda">TIC ORDENES DE SERVICIO</font></b><br/>'
            '<b><font size="9" color="#d4edda">EQUIPOS DE COMPUTO</font></b><br/><br/>'
            f'<b><font size="20" color="white">{pe(codigo_doc)}</font></b><br/>'
            f'<font size="8" color="#d4edda">N.º ticket: <b>{pe(num_ticket)}</b>{ofi_line}</font>'
            '</para>',
            styles['Normal'],
        )
        banner = Table([[hdr]], colWidths=[full_w], rowHeights=[1.22 * inch])
        banner.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, -1), brand_dark),
                    ('BOX', (0, 0), (-1, -1), 1.2, brand_mid),
                ]
            )
        )
        story.append(banner)
        story.append(Spacer(1, 0.12 * inch))

        cw4 = [full_w * 0.17, full_w * 0.33, full_w * 0.17, full_w * 0.33]

        def lab(txt):
            return Paragraph(f'<b>{pe(txt)}</b>', cell_label)

        def compact_section_table(body, spans):
            ts = [
                ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, stripe]),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOX', (0, 0), (-1, -1), 0.55, border),
                ('INNERGRID', (0, 0), (-1, -1), 0.3, accent),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]
            for sc, sr, ec, er in spans:
                ts.append(('SPAN', (sc, sr), (ec, er)))
            t = Table(body, colWidths=cw4)
            t.setStyle(TableStyle(ts))
            return t

        def sec1_informacion_cliente():
            dep = pick('dependencia')
            id_fun = pick('identificacion_funcionario', ticket.solicitante_identificacion or '-')
            corr = f"{ticket.solicitante_correo or '-'} · {ticket.solicitante_telefono or '-'}"
            body = [
                [
                    lab('DEPENDENCIA:'),
                    pblock(dep, cell_value),
                    lab('Nº TICKET:'),
                    Paragraph(f'<b>{pe(num_ticket)}</b>', cell_value),
                ],
                [
                    lab('ORDEN / REF.:'),
                    pblock(orden_no, cell_value),
                    lab('IDENTIFICACIÓN:'),
                    pblock(id_fun, cell_value),
                ],
                [lab('SOLICITANTE:'), pblock(solicitante, cell_value), '', ''],
                [lab('CORREO / TELÉFONO:'), pblock(corr, cell_value), '', ''],
                [lab('DESCRIPCIÓN INICIAL:'), pblock(desc_inicial, cell_value), '', ''],
            ]
            sp = [(1, 2, 3, 2), (1, 3, 3, 3), (1, 4, 3, 4)]
            return [Paragraph(pe('1. INFORMACION DILIGENCIADA POR EL CLIENTE'), section_title), compact_section_table(body, sp)]

        def sec2_equipo():
            d_eq = pick('datos_equipo', tipo_equipo)
            mod = pick('modelo', modelo_equipo)
            ser = pick('serial', getattr(equipo, 'serie', '') or '-')
            body = [
                [lab('TIPO DE DAÑO / SOLICITUD:'), pblock(tipo_dano_txt, cell_value), '', ''],
                [
                    lab('DATOS DEL EQUIPO:'),
                    pblock(d_eq, cell_value),
                    lab('MODELO:'),
                    pblock(mod, cell_value),
                ],
                [lab('SERIAL / Nº USUARIO:'), pblock(ser, cell_value), '', ''],
            ]
            return [
                Paragraph(pe('2. DATOS DEL EQUIPO (TECNICO)'), section_title),
                compact_section_table(body, [(1, 0, 3, 0), (1, 2, 3, 2)]),
            ]

        quien_diag = pick('diagnostico_realizo', pick('soporte_realizo', getattr(ticket, 'atendido_por', '') or '-'))
        fecha_srv = pick('fecha', datetime.now().strftime('%Y-%m-%d'))
        realizo = pick('soporte_realizo', quien_diag)
        desc_mant = pick('soporte_descripcion', getattr(ticket, 'procedimiento', '') or '-')
        if (not desc_mant or desc_mant == '-') and getattr(ticket, 'procedimiento', None):
            desc_mant = ticket.procedimiento or '-'

        def sec3_soporte():
            body = [
                [
                    lab('FECHA:'),
                    pblock(fecha_srv, cell_value),
                    lab('REALIZÓ:'),
                    pblock(realizo, cell_value),
                ],
                [lab('DESCRIPCIÓN:'), pblock(desc_mant, cell_value), '', ''],
            ]
            return [Paragraph(pe('3. SOPORTE REALIZADO'), section_title), compact_section_table(body, [(1, 1, 3, 1)])]

        story.extend(sec1_informacion_cliente())
        story.extend(sec2_equipo())
        story.extend(sec3_soporte())

        # 4. Tabla de productos (antes punto 6 en la guía)
        story.append(Paragraph(pe('4. RECOMENDACIONES ADICIONALES'), section_title))
        comp_rows = _filas_componentes_stock(ticket)
        inv_header = [
            Paragraph('<b>#</b>', cell_label),
            Paragraph('<b>Producto / componente</b>', cell_label),
            Paragraph('<b>Ref. / código</b>', cell_label),
            Paragraph('<b>Cant.</b>', cell_label),
            Paragraph('<b>Fecha registro</b>', cell_label),
        ]
        inv_data = [inv_header]
        nbsp = '\u00a0'
        if not comp_rows:
            inv_data.append(
                [
                    Paragraph(nbsp, cell_value),
                    Paragraph('<i>Sin salidas de inventario registradas para este ticket.</i>', cell_value),
                    Paragraph(nbsp, cell_value),
                    Paragraph(nbsp, cell_value),
                    Paragraph(nbsp, cell_value),
                ]
            )
        else:
            for idx, row in enumerate(comp_rows, start=1):
                inv_data.append(
                    [
                        Paragraph(pe(str(idx)), cell_value),
                        Paragraph(pe(row['producto']), cell_value),
                        Paragraph(pe(row['ref']), cell_value),
                        Paragraph(pe(row['cant']), cell_value),
                        Paragraph(pe(row['fecha']), cell_value),
                    ]
                )

        inv_table = Table(
            inv_data,
            colWidths=[full_w * 0.07, full_w * 0.38, full_w * 0.22, full_w * 0.10, full_w * 0.23],
            repeatRows=1,
        )
        inv_table.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), brand_mid),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                    ('ALIGN', (3, 0), (3, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BOX', (0, 0), (-1, -1), 0.65, border),
                    ('INNERGRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cfe9d6')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, stripe]),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(inv_table)

        # Firmas: nombre + oficina / nombre + cargo, con raya para firmar (como guía)
        ofi_func = pick('oficina_funcionario', oficina_nombre or '-')
        cargo_tec = (pick('cargo_tecnico') or pick('cargo') or '').strip() or 'Técnico'

        def sign_cell(nombre, linea2, etiqueta_firma):
            return Paragraph(
                '<para align="center">'
                f'<b><font size="10">{pe(nombre)}</font></b><br/>'
                f'<font size="9">{pe(linea2)}</font><br/><br/>'
                '<font size="8" color="#222222">________________________________________</font><br/>'
                f'<font size="8" color="#444444">{pe(etiqueta_firma)}</font>'
                '</para>',
                sign_block,
            )

        story.append(Spacer(1, 0.22 * inch))
        firma_t = Table(
            [
                [
                    sign_cell(
                        solicitante or '-',
                        f'Oficina: {ofi_func}',
                        'Firma del funcionario',
                    ),
                    sign_cell(
                        realizo or '-',
                        f'Cargo: {cargo_tec}',
                        'Firma del técnico',
                    ),
                ],
            ],
            colWidths=[full_w * 0.5, full_w * 0.5],
            rowHeights=[1.05 * inch],
        )
        firma_t.setStyle(
            TableStyle(
                [
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(firma_t)

        gen_ts = datetime.now().strftime('%Y-%m-%d %H:%M')
        story.append(Spacer(1, 0.14 * inch))
        story.append(
            Paragraph(
                pe(f'Ficha técnica generada el {gen_ts} · Sistema de tickets Oficina TIC'),
                small_footer,
            )
        )

        doc.build(story)
        return str(path)
    except Exception:
        logger.exception('generar_pdf_ticket: fallo ReportLab, usando TXT de respaldo')
        path = tickets_dir / f'ficha_tecnica_{ticket.id}.txt'
        eq = getattr(ticket, 'equipo', None)
        eq_line = '-'
        if eq is not None:
            try:
                eq_line = f'{getattr(eq, "tipo", "") or "-"} - {getattr(eq, "serie", "") or "-"}'
            except Exception:
                eq_line = '-'
        with open(path, 'w', encoding='utf-8') as f:
            f.write(f"Ficha técnica · Ticket #{ticket.id}\n")
            if ticket.numero_ficha_tecnica:
                f.write(f"Documento TIC: {int(ticket.numero_ficha_tecnica):08d}\n")
            f.write(f"Solicitante: {ticket.solicitante_nombre or '-'}\n")
            f.write(f"Equipo: {eq_line}\n")
            f.write(f"Estado: {ticket.estado}\n")
            f.write(f"Atendido por: {getattr(ticket, 'atendido_por', '') or '-'}\n")
            f.write(f"Descripción:\n{ticket.descripcion}\n")
            proc = getattr(ticket, 'procedimiento', '') or ''
            if proc:
                f.write(f"Procedimiento:\n{proc}\n")
        return str(path)
