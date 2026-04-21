import io
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import models
from django.utils import timezone


class CategoriaInventario(models.Model):
    nombre = models.CharField(max_length=120, unique=True)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Categoría de inventario'
        verbose_name_plural = 'Categorías de inventario'

    def __str__(self):
        return self.nombre


class StockInventario(models.Model):
    categoria_catalogo = models.ForeignKey(
        CategoriaInventario,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='stocks',
    )
    categoria = models.CharField(max_length=120)
    tipo = models.CharField(max_length=120)
    producto = models.CharField(max_length=160)
    marca = models.CharField(max_length=80, blank=True, default='')
    modelo = models.CharField(max_length=80, blank=True, default='')
    referencia_fabricante = models.CharField(max_length=120, blank=True, default='')
    codigo_barras = models.CharField(max_length=120, blank=True, default='')
    placa_interna = models.CharField(max_length=80, blank=True, default='')
    numero_serie = models.CharField(max_length=120, blank=True, default='')
    ubicacion_actual = models.CharField(max_length=120, blank=True, default='')
    cantidad_actual = models.PositiveIntegerField(default=0)
    stock_minimo = models.PositiveIntegerField(default=1)
    activo = models.BooleanField(default=True)
    fecha_ultima_entrada = models.DateTimeField(null=True, blank=True)
    fecha_ultima_salida = models.DateTimeField(null=True, blank=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='stocks_creados',
    )
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='stocks_actualizados',
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['categoria', 'tipo', 'producto', 'numero_serie']
        verbose_name = 'Stock'
        verbose_name_plural = 'Stock'

    def __str__(self):
        serial = f' - {self.numero_serie}' if self.numero_serie else ''
        return f'{self.producto}{serial}'

    def save(self, *args, **kwargs):
        if self.categoria_catalogo_id:
            self.categoria = self.categoria_catalogo.nombre
        super().save(*args, **kwargs)

    @property
    def en_alerta(self):
        return self.cantidad_actual <= self.stock_minimo

    def registrar_ingreso(self, cantidad):
        self.cantidad_actual += cantidad
        self.fecha_ultima_entrada = timezone.now()
        self.save(update_fields=['cantidad_actual', 'fecha_ultima_entrada', 'actualizado_en'])

    def registrar_salida(self, cantidad):
        if cantidad > self.cantidad_actual:
            raise ValidationError({'cantidad': 'No hay suficiente stock para la salida.'})
        self.cantidad_actual -= cantidad
        self.fecha_ultima_salida = timezone.now()
        self.save(update_fields=['cantidad_actual', 'fecha_ultima_salida', 'actualizado_en'])


class IngresoInventario(models.Model):
    TIPOS_DOCUMENTO = [
        ('FACTURA', 'Factura'),
        ('REMISION', 'Remisión'),
        ('ORDEN_COMPRA', 'Orden de compra'),
        ('ACTA_DONACION', 'Acta de donación'),
        ('OTRO', 'Otro'),
    ]

    ESTADOS_RECEPCION = [
        ('NUEVO', 'Nuevo'),
        ('BUEN_ESTADO', 'Buen estado'),
        ('CON_OBSERVACION', 'Con observación'),
        ('DEFECTUOSO', 'Defectuoso'),
    ]

    stock = models.ForeignKey(
        StockInventario,
        on_delete=models.PROTECT,
        related_name='ingresos',
        null=True,
        blank=True,
    )
    cantidad = models.PositiveIntegerField(default=1)
    fecha_entrada = models.DateTimeField(default=timezone.now)
    tipo_documento = models.CharField(max_length=20, choices=TIPOS_DOCUMENTO, default='FACTURA')
    numero_documento = models.CharField(max_length=80, blank=True, default='')
    proveedor = models.CharField(max_length=150, blank=True, default='')
    orden_compra = models.CharField(max_length=80, blank=True, default='')
    guia_remision = models.CharField(max_length=80, blank=True, default='')
    oficina_receptora = models.ForeignKey(
        'api.Oficina',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ingresos_inventario',
    )
    area_receptora = models.CharField(max_length=120, blank=True, default='')

    categoria_catalogo = models.ForeignKey(
        CategoriaInventario,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ingresos',
    )
    categoria_producto = models.CharField(max_length=120, blank=True, default='')
    tipo_producto = models.CharField(max_length=120, blank=True, default='')
    producto_nombre = models.CharField(max_length=160, blank=True, default='')
    marca = models.CharField(max_length=80, blank=True, default='')
    modelo = models.CharField(max_length=80, blank=True, default='')
    referencia_fabricante = models.CharField(max_length=120, blank=True, default='')
    codigo_barras = models.CharField(max_length=120, blank=True, default='')
    numero_serie = models.CharField(max_length=120, blank=True, default='')
    placa_interna = models.CharField(max_length=80, blank=True, default='')

    lote = models.CharField(max_length=80, blank=True, default='')
    fecha_vencimiento = models.DateField(null=True, blank=True)
    vencimiento_no_aplica = models.BooleanField(default=False)
    estado_recepcion = models.CharField(max_length=20, choices=ESTADOS_RECEPCION, default='NUEVO')
    ubicacion_inicial = models.CharField(max_length=120, blank=True, default='')
    recibido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ingresos_recibidos',
    )
    observaciones = models.TextField(blank=True, default='')
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ingresos_registrados',
    )
    stock_aplicado = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_entrada']
        verbose_name = 'Ingreso'
        verbose_name_plural = 'Ingresos'

    def __str__(self):
        if self.stock_id:
            return f'Ingreso {self.stock.producto} x {self.cantidad}'
        return f'Ingreso {self.producto_nombre or "Producto nuevo"} x {self.cantidad}'

    def _poblar_snapshot_producto(self):
        if not self.stock_id:
            return
        if self.stock.categoria_catalogo_id:
            self.categoria_catalogo = self.categoria_catalogo or self.stock.categoria_catalogo
        self.categoria_producto = self.categoria_producto or self.stock.categoria
        self.tipo_producto = self.tipo_producto or self.stock.tipo
        self.producto_nombre = self.producto_nombre or self.stock.producto
        self.marca = self.marca or self.stock.marca
        self.modelo = self.modelo or self.stock.modelo
        self.referencia_fabricante = self.referencia_fabricante or self.stock.referencia_fabricante
        self.codigo_barras = self.codigo_barras or self.stock.codigo_barras
        self.numero_serie = self.numero_serie or self.stock.numero_serie
        self.placa_interna = self.placa_interna or self.stock.placa_interna

    def _buscar_stock_existente(self):
        if self.stock_id:
            return self.stock

        base_qs = StockInventario.objects.filter(activo=True)

        if self.codigo_barras:
            stock = base_qs.filter(codigo_barras__iexact=self.codigo_barras.strip()).first()
            if stock:
                return stock

        if self.referencia_fabricante:
            stock = base_qs.filter(referencia_fabricante__iexact=self.referencia_fabricante.strip()).first()
            if stock:
                return stock

        if self.tipo_producto:
            stock_qs = base_qs.filter(tipo__iexact=self.tipo_producto.strip())
            if self.producto_nombre:
                stock_qs = stock_qs.filter(producto__iexact=self.producto_nombre.strip())
            if self.categoria_catalogo_id:
                stock_qs = stock_qs.filter(categoria_catalogo_id=self.categoria_catalogo_id)
            if self.categoria_producto:
                stock_qs = stock_qs.filter(categoria__iexact=self.categoria_producto.strip())
            stock = stock_qs.first()
            if stock:
                return stock

        return None

    def _crear_stock_desde_ingreso(self):
        if self.stock_id:
            return

        stock_existente = self._buscar_stock_existente()
        if stock_existente:
            self.stock = stock_existente
            return

        self.stock = StockInventario.objects.create(
            categoria_catalogo=self.categoria_catalogo,
            categoria=self.categoria_producto,
            tipo=self.tipo_producto,
            producto=self.producto_nombre,
            marca=self.marca,
            modelo=self.modelo,
            referencia_fabricante=self.referencia_fabricante,
            codigo_barras=self.codigo_barras,
            placa_interna=self.placa_interna,
            numero_serie=self.numero_serie,
            ubicacion_actual=self.ubicacion_inicial,
            cantidad_actual=0,
            creado_por=self.registrado_por,
            actualizado_por=self.registrado_por,
        )

    def _tiene_lote_historico(self, stock):
        if not stock:
            return False
        return stock.ingresos.exclude(pk=self.pk).filter(lote__gt='').exists()

    def _tiene_vencimiento_historico(self, stock):
        if not stock:
            return False
        return stock.ingresos.exclude(pk=self.pk).filter(fecha_vencimiento__isnull=False).exists()

    def _vencimiento_no_aplica_historico(self, stock):
        if not stock:
            return False
        return stock.ingresos.exclude(pk=self.pk).filter(vencimiento_no_aplica=True).exists()

    def clean(self):
        if self.cantidad <= 0:
            raise ValidationError({'cantidad': 'La cantidad debe ser mayor a cero.'})

        stock_referencia = self.stock if self.stock_id else self._buscar_stock_existente()
        if stock_referencia and not self.stock_id:
            self.stock = stock_referencia

        if self.categoria_catalogo_id and not self.categoria_producto:
            self.categoria_producto = self.categoria_catalogo.nombre

        errors = {}

        if not self.recibido_por_id:
            errors['recibido_por'] = 'Debes indicar quién recibió el producto.'
        if not self.registrado_por_id:
            errors['registrado_por'] = 'Debes indicar quién registró el ingreso.'

        referencia_en_stock = bool(stock_referencia and stock_referencia.tipo)
        barcode_en_stock = bool(stock_referencia and stock_referencia.codigo_barras)
        serial_en_stock = bool(stock_referencia and stock_referencia.numero_serie)
        lote_en_stock = self._tiene_lote_historico(stock_referencia)
        vencimiento_en_stock = self._tiene_vencimiento_historico(stock_referencia)
        vencimiento_no_aplica_historico = self._vencimiento_no_aplica_historico(stock_referencia)

        if not self.tipo_producto and not referencia_en_stock:
            errors['tipo_producto'] = 'La referencia de producto es obligatoria si no existe en stock.'
        if not self.codigo_barras and not barcode_en_stock:
            errors['codigo_barras'] = 'El código de barras es obligatorio si no existe en stock.'
        if not self.numero_serie and not serial_en_stock:
            errors['numero_serie'] = 'El serial es obligatorio si no existe en stock.'
        if not self.lote and not lote_en_stock:
            errors['lote'] = 'El lote es obligatorio si no existe previamente para este producto.'
        if not self.vencimiento_no_aplica and not self.fecha_vencimiento and not vencimiento_en_stock and not vencimiento_no_aplica_historico:
            errors['fecha_vencimiento'] = 'La fecha de vencimiento es obligatoria si no existe previamente para este producto.'

        if errors:
            raise ValidationError(errors)

        if not self.stock_id:
            required = {}
            if not self.categoria_producto and not self.categoria_catalogo_id:
                required['categoria_producto'] = 'La categoría es obligatoria cuando el producto es nuevo.'
            if not self.tipo_producto:
                required['tipo_producto'] = 'El tipo es obligatorio cuando el producto es nuevo.'
            if not self.producto_nombre:
                required['producto_nombre'] = 'El nombre del producto es obligatorio cuando el producto es nuevo.'
            if required:
                raise ValidationError(required)

        if self.stock_id and self.stock.numero_serie and self.numero_serie and self.numero_serie != self.stock.numero_serie:
            raise ValidationError({'numero_serie': 'El serial ingresado no coincide con el serial del stock seleccionado.'})

        if self.numero_serie:
            duplicado = StockInventario.objects.filter(numero_serie=self.numero_serie, activo=True).exclude(pk=self.stock_id).exists()
            if duplicado:
                raise ValidationError({'numero_serie': 'Ya existe un activo con este número de serie en inventario.'})

    def save(self, *args, **kwargs):
        if self.vencimiento_no_aplica:
            self.fecha_vencimiento = None

        is_new = self.pk is None
        self._crear_stock_desde_ingreso()
        self._poblar_snapshot_producto()
        super().save(*args, **kwargs)
        if is_new and not self.stock_aplicado:
            if self.numero_serie and not self.stock.numero_serie:
                self.stock.numero_serie = self.numero_serie
            if self.codigo_barras and not self.stock.codigo_barras:
                self.stock.codigo_barras = self.codigo_barras
            if self.referencia_fabricante and not self.stock.referencia_fabricante:
                self.stock.referencia_fabricante = self.referencia_fabricante
            if self.placa_interna and not self.stock.placa_interna:
                self.stock.placa_interna = self.placa_interna
            if self.ubicacion_inicial:
                self.stock.ubicacion_actual = self.ubicacion_inicial
            self.stock.save(
                update_fields=[
                    'numero_serie',
                    'codigo_barras',
                    'referencia_fabricante',
                    'placa_interna',
                    'ubicacion_actual',
                    'actualizado_en',
                ]
            )
            self.stock.registrar_ingreso(self.cantidad)
            self.stock_aplicado = True
            super().save(update_fields=['stock_aplicado'])


class SalidaInventario(models.Model):
    MOTIVOS = [
        ('INSTALACION', 'Instalación'),
        ('TRASLADO', 'Traslado'),
        ('PRESTAMO', 'Préstamo'),
        ('BAJA', 'Baja por daño'),
        ('EXTRAVIADO', 'Extraviado'),
    ]

    stock = models.ForeignKey(StockInventario, on_delete=models.PROTECT, related_name='salidas')
    cantidad = models.PositiveIntegerField(default=1)
    motivo = models.CharField(max_length=20, choices=MOTIVOS, default='INSTALACION')
    fecha_salida = models.DateTimeField(default=timezone.now)

    oficina_destino = models.ForeignKey(
        'api.Oficina',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='salidas_inventario',
    )
    funcionario_destino = models.ForeignKey(
        'api.Persona',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='salidas_inventario',
    )
    tecnico_responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='salidas_tecnicas',
    )

    tecnico_nombre = models.CharField(max_length=150, blank=True, default='')
    tecnico_usuario = models.CharField(max_length=150, blank=True, default='')
    funcionario_nombre = models.CharField(max_length=150, blank=True, default='')
    funcionario_identificacion = models.CharField(max_length=50, blank=True, default='')
    funcionario_tipo = models.CharField(max_length=30, blank=True, default='')

    firma_tecnico_nombre = models.CharField(max_length=150, blank=True, default='')
    firma_funcionario_nombre = models.CharField(max_length=150, blank=True, default='')
    observaciones = models.TextField(blank=True, default='')
    acta_pdf = models.FileField(upload_to='inventario/actas/', null=True, blank=True)

    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='salidas_registradas',
    )
    stock_aplicado = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_salida']
        verbose_name = 'Salida'
        verbose_name_plural = 'Salidas'

    def __str__(self):
        return f'Salida {self.stock.producto} x {self.cantidad}'

    def clean(self):
        if self.cantidad <= 0:
            raise ValidationError({'cantidad': 'La cantidad debe ser mayor a cero.'})

        if not self.stock_aplicado and self.pk is None and self.cantidad > self.stock.cantidad_actual:
            raise ValidationError({'cantidad': 'No hay suficiente stock para registrar la salida.'})

        if self.motivo in ['INSTALACION', 'PRESTAMO']:
            errors = {}
            if not self.oficina_destino:
                errors['oficina_destino'] = 'La oficina destino es obligatoria.'
            if not self.funcionario_destino:
                errors['funcionario_destino'] = 'El funcionario o contratista destino es obligatorio.'
            if not self.tecnico_responsable:
                errors['tecnico_responsable'] = 'El técnico responsable es obligatorio.'
            if errors:
                raise ValidationError(errors)

    def _poblar_snapshots(self):
        if self.tecnico_responsable:
            self.tecnico_usuario = self.tecnico_responsable.username
            self.tecnico_nombre = self.tecnico_responsable.get_full_name() or self.tecnico_responsable.username

        if self.funcionario_destino:
            self.funcionario_nombre = self.funcionario_destino.nombre
            self.funcionario_identificacion = self.funcionario_destino.identificacion
            self.funcionario_tipo = self.funcionario_destino.get_tipo_display()

        if not self.firma_tecnico_nombre and self.tecnico_nombre:
            self.firma_tecnico_nombre = self.tecnico_nombre
        if not self.firma_funcionario_nombre and self.funcionario_nombre:
            self.firma_funcionario_nombre = self.funcionario_nombre

    def _generar_pdf_entrega(self):
        if self.acta_pdf:
            return

        try:
            from reportlab.lib import colors
            from reportlab.lib.enums import TA_CENTER
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
            )
        except Exception:
            return

        buffer = io.BytesIO()
        margin = 2.0 * cm
        avail_w = letter[0] - 2 * margin
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=2.5 * cm,
        )

        base = getSampleStyleSheet()['Normal']
        dark_blue = colors.HexColor('#1a3a5c')
        mid_gray = colors.HexColor('#cccccc')
        light_gray = colors.HexColor('#f2f4f6')

        def _s(name, **kw):
            return ParagraphStyle(name, parent=base, **kw)

        st_header = _s('Hdr', fontName='Helvetica-Bold', fontSize=11,
                        alignment=TA_CENTER, textColor=colors.white)
        st_title = _s('Ttl', fontName='Helvetica-Bold', fontSize=14,
                       alignment=TA_CENTER, textColor=dark_blue, spaceBefore=6)
        st_sub = _s('Sub', fontName='Helvetica', fontSize=9,
                     alignment=TA_CENTER, textColor=dark_blue)
        st_sec = _s('Sec', fontName='Helvetica-Bold', fontSize=9, textColor=colors.white)
        st_lbl = _s('Lbl', fontName='Helvetica-Bold', fontSize=9)
        st_val = _s('Val', fontName='Helvetica', fontSize=9)
        st_fn = _s('Fn', fontName='Helvetica-Bold', fontSize=9, alignment=TA_CENTER)
        st_fc = _s('Fc', fontName='Helvetica', fontSize=8, alignment=TA_CENTER,
                    textColor=colors.HexColor('#555555'))
        st_foot = _s('Ft', fontName='Helvetica', fontSize=7,
                      alignment=TA_CENTER, textColor=colors.HexColor('#888888'))

        def sec_bar(text):
            t = Table([[Paragraph(text, st_sec)]], colWidths=[avail_w])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), dark_blue),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ]))
            return t

        def data_tbl(rows):
            lw = 5.5 * cm
            data = [[Paragraph(k, st_lbl), Paragraph(v or 'N/A', st_val)] for k, v in rows]
            t = Table(data, colWidths=[lw, avail_w - lw])
            row_n = len(data)
            t.setStyle(TableStyle([
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS', (0, 0), (-1, row_n - 1), [light_gray, colors.white]),
                ('BOX', (0, 0), (-1, -1), 0.5, mid_gray),
                ('INNERGRID', (0, 0), (-1, -1), 0.25, mid_gray),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            return t

        story = []
        fecha_obj = timezone.localtime(self.fecha_salida)
        fecha_str = fecha_obj.strftime('%d de %B de %Y').title()
        acta_num = str(self.pk).zfill(4)

        # ── Encabezado ──────────────────────────────────────────────────────────
        hdr_t = Table(
            [[Paragraph('ÁREA DE TECNOLOGÍAS DE LA INFORMACIÓN Y COMUNICACIONES (TIC)', st_header)]],
            colWidths=[avail_w],
        )
        hdr_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), dark_blue),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(hdr_t)
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph('ACTA DE ENTREGA DE RECURSOS INFORMÁTICOS', st_title))
        story.append(Paragraph(f'Acta N.° {acta_num}  —  Fecha: {fecha_str}', st_sub))
        story.append(Spacer(1, 0.2 * cm))
        story.append(HRFlowable(width=avail_w, thickness=1, color=dark_blue, spaceAfter=6))

        # ── Datos del producto ───────────────────────────────────────────────────
        story.append(sec_bar('DATOS DEL EQUIPO / PRODUCTO'))
        marca_mod = ' / '.join(filter(None, [self.stock.marca, self.stock.modelo])) or 'N/A'
        story.append(data_tbl([
            ('Categoría:', self.stock.categoria or self.stock.tipo),
            ('Tipo de producto:', self.stock.tipo),
            ('Producto / Descripción:', self.stock.producto),
            ('Marca / Modelo:', marca_mod),
            ('Número de serie:', self.stock.numero_serie or 'N/A'),
            ('Código de barras:', self.stock.codigo_barras or 'N/A'),
            ('Placa interna:', self.stock.placa_interna or 'N/A'),
            ('Cantidad entregada:', str(self.cantidad)),
            ('Motivo de salida:', self.get_motivo_display()),
        ]))
        story.append(Spacer(1, 0.3 * cm))

        # ── Datos de entrega ─────────────────────────────────────────────────────
        story.append(sec_bar('DATOS DE ENTREGA'))
        story.append(data_tbl([
            ('Dependencia / Oficina:', self.oficina_destino.nombre if self.oficina_destino else 'N/A'),
            ('Destinatario:', self.funcionario_nombre or 'N/A'),
            ('Tipo de destinatario:', self.funcionario_tipo or 'N/A'),
            ('Identificación:', self.funcionario_identificacion or 'N/A'),
            ('Fecha de entrega:', fecha_str),
        ]))
        story.append(Spacer(1, 0.3 * cm))

        # ── Observaciones ────────────────────────────────────────────────────────
        if self.observaciones:
            story.append(sec_bar('OBSERVACIONES'))
            obs_t = Table([[Paragraph(self.observaciones, st_val)]], colWidths=[avail_w])
            obs_t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fffde7')),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('BOX', (0, 0), (-1, -1), 0.5, mid_gray),
            ]))
            story.append(obs_t)
            story.append(Spacer(1, 0.3 * cm))

        # ── Firmas ───────────────────────────────────────────────────────────────
        story.append(Spacer(1, 0.8 * cm))
        story.append(sec_bar('FIRMAS'))
        story.append(Spacer(1, 1.6 * cm))

        tecnico = self.firma_tecnico_nombre or self.tecnico_nombre or '...'
        receptor = self.firma_funcionario_nombre or self.funcionario_nombre or '...'
        receptor_detalle = ' — '.join(filter(None, [
            self.funcionario_tipo or 'Funcionario',
            f'C.C. {self.funcionario_identificacion}' if self.funcionario_identificacion else '',
        ]))
        sig_w = avail_w / 2

        sig_t = Table(
            [
                [Paragraph('_' * 34, st_fn), Paragraph('_' * 34, st_fn)],
                [Paragraph(tecnico, st_fn), Paragraph(receptor, st_fn)],
                [Paragraph('Técnico — Área TIC', st_fc), Paragraph(receptor_detalle, st_fc)],
            ],
            colWidths=[sig_w, sig_w],
        )
        sig_t.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(sig_t)

        # ── Pie de página ────────────────────────────────────────────────────────
        story.append(Spacer(1, 0.5 * cm))
        story.append(HRFlowable(width=avail_w, thickness=0.5, color=mid_gray, spaceAfter=4))
        gen_ts = timezone.localtime(timezone.now()).strftime('%d/%m/%Y %H:%M')
        story.append(Paragraph(
            f'Acta generada el {gen_ts} — Sistema de Gestión de Inventario TIC',
            st_foot,
        ))

        doc.build(story)
        buffer.seek(0)
        filename = f'acta_entrega_{acta_num}.pdf'
        self.acta_pdf.save(filename, ContentFile(buffer.read()), save=False)

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        self._poblar_snapshots()

        super().save(*args, **kwargs)

        if is_new and not self.stock_aplicado:
            self.stock.registrar_salida(self.cantidad)
            self.stock_aplicado = True
            super().save(update_fields=['stock_aplicado'])

        if is_new:
            self._generar_pdf_entrega()
            if self.acta_pdf and 'update_fields' not in kwargs:
                super().save(update_fields=['acta_pdf'])
