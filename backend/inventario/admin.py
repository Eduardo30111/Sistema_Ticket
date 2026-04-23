from django.contrib import admin, messages
from django.http import JsonResponse
from django.urls import path
from django.utils.html import conditional_escape, mark_safe

from .models import ALERTA_STOCK_UMBRAL, CategoriaInventario, SalidaInventario, StockInventario


@admin.register(CategoriaInventario)
class CategoriaInventarioAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'activa')
    list_filter = ('activa',)
    search_fields = ('nombre',)

    def get_model_perms(self, request):
        # Keep the model available for FK/autocomplete but hidden from the admin menu.
        return {}


class StockAlertFilter(admin.SimpleListFilter):
    title = 'alerta de stock'
    parameter_name = 'stock_alerta'

    def lookups(self, request, model_admin):
        return (
            ('SI', 'En alerta'),
            ('NO', 'Normal'),
        )

    def queryset(self, request, queryset):
        value = self.value()
        if value == 'SI':
            return queryset.filter(cantidad_actual__lte=ALERTA_STOCK_UMBRAL)
        if value == 'NO':
            return queryset.filter(cantidad_actual__gt=ALERTA_STOCK_UMBRAL)
        return queryset


@admin.register(StockInventario)
class StockInventarioAdmin(admin.ModelAdmin):
    class Media:
        js = ('admin/js/stock_elegir_existente.js',)

    """Una sola ficha: nombre o marca, referencia, código de barras, cantidad y lista de existentes (JS)."""

    fields = ('producto', 'marca', 'referencia_fabricante', 'codigo_barras', 'cantidad_actual')
    list_display = (
        'producto',
        'marca',
        'referencia_fabricante',
        'codigo_barras',
        'cantidad_actual',
        'alerta_unidades',
    )
    list_filter = (StockAlertFilter,)
    search_fields = (
        'producto',
        'marca',
        'referencia_fabricante',
        'codigo_barras',
    )

    def get_urls(self):
        info = self.model._meta.app_label, self.model._meta.model_name
        return [
            path(
                'json-opciones-stock/',
                self.admin_site.admin_view(self.json_opciones_stock),
                name='%s_%s_json_opciones_stock' % info,
            ),
        ] + super().get_urls()

    def json_opciones_stock(self, request):
        if not request.user.is_staff:
            return JsonResponse({'error': 'No autorizado'}, status=403)
        qs = (
            StockInventario.objects.filter(activo=True)
            .order_by('referencia_fabricante', 'producto', 'marca')[:800]
        )
        items = [
            {
                'id': s.pk,
                'producto': s.producto or '',
                'marca': s.marca or '',
                'tipo': s.tipo or '',
                'referencia': s.referencia_fabricante or '',
                'serie': s.numero_serie or '',
                'codigo': s.codigo_barras or '',
                'cantidad': s.cantidad_actual,
            }
            for s in qs
        ]
        return JsonResponse({'items': items})

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'producto' in form.base_fields:
            form.base_fields['producto'].label = 'Nombre'
            form.base_fields['producto'].required = False
            form.base_fields['producto'].help_text = 'Opcional si ya indicaste la marca.'
        if 'marca' in form.base_fields:
            form.base_fields['marca'].required = False
            form.base_fields['marca'].help_text = 'Opcional si ya indicaste el nombre.'
        if 'referencia_fabricante' in form.base_fields:
            form.base_fields['referencia_fabricante'].label = 'Referencia del producto'
            form.base_fields['referencia_fabricante'].required = False
            form.base_fields['referencia_fabricante'].help_text = (
                'Obligatoria salvo que uses solo código de barras. Si coincide con un producto ya en stock, se suma la cantidad.'
            )
        if 'codigo_barras' in form.base_fields:
            form.base_fields['codigo_barras'].label = 'Código de barras'
            form.base_fields['codigo_barras'].required = False
            form.base_fields['codigo_barras'].help_text = (
                'Opcional si ya pusiste referencia. Si coincide con un producto existente, se suma la cantidad.'
            )
        if 'cantidad_actual' in form.base_fields:
            if obj and obj.pk:
                form.base_fields['cantidad_actual'].help_text = 'Unidades en inventario.'
            else:
                form.base_fields['cantidad_actual'].help_text = (
                    'Cantidad que entra. Puedes elegir un producto de la lista arriba y solo cambiar este valor.'
                )
        return form

    @admin.display(description='Alerta')
    def alerta_unidades(self, obj):
        if obj.cantidad_actual <= ALERTA_STOCK_UMBRAL:
            return f'≤{ALERTA_STOCK_UMBRAL} uds.'
        return 'OK'

    def save_model(self, request, obj, form, change):
        obj.actualizado_por = request.user
        if not change:
            dup = StockInventario.buscar_fila_para_sumar(
                obj.referencia_fabricante,
                obj.numero_serie,
                obj.codigo_barras,
                obj.tipo,
            )
            if dup:
                qty = obj.cantidad_actual
                dup.registrar_ingreso(qty)
                dup.actualizado_por = request.user
                dup.save(update_fields=['actualizado_por'])
                etiqueta = (dup.producto or dup.marca or '').strip() or f'#{dup.pk}'
                self.message_user(
                    request,
                    f'Se sumaron {qty} uds. al producto existente «{etiqueta}» (misma referencia, serie o código de barras).',
                    messages.SUCCESS,
                )
                obj.pk = dup.pk
                obj._state.adding = False
                obj.refresh_from_db()
                return
        if not obj.creado_por:
            obj.creado_por = request.user
        super().save_model(request, obj, form, change)


@admin.register(SalidaInventario)
class SalidaInventarioAdmin(admin.ModelAdmin):
    list_display = (
        'fecha_salida',
        'stock',
        'cantidad',
        'motivo',
        'oficina_destino',
        'funcionario_nombre',
        'tecnico_nombre',
        'registrado_por',
    )
    list_filter = ('motivo', 'fecha_salida', 'stock__categoria', 'stock__tipo')
    search_fields = (
        'stock__producto',
        'stock__referencia_fabricante',
        'funcionario_nombre',
        'funcionario_identificacion',
        'tecnico_nombre',
        'tecnico_usuario',
    )
    readonly_fields = (
        'creado_en',
        'stock_aplicado',
        'tecnico_nombre',
        'tecnico_usuario',
        'funcionario_nombre',
        'funcionario_identificacion',
        'funcionario_tipo',
        'info_stock',
        'acta_pdf',
    )
    autocomplete_fields = (
        'stock',
        'oficina_destino',
        'tecnico_responsable',
        'registrado_por',
    )
    fieldsets = (
        ('Producto a entregar', {
            'fields': ('stock', 'info_stock', 'cantidad', 'motivo'),
        }),
        ('Datos de la entrega', {
            'fields': ('fecha_salida', 'oficina_destino', 'funcionario_destino'),
            'description': (
                'Selecciona primero la oficina para que la lista de '
                'funcionarios/contratistas se filtre automáticamente.'
            ),
        }),
        ('Técnico responsable', {
            'fields': ('tecnico_responsable',),
        }),
        ('Observaciones', {
            'fields': ('observaciones',),
        }),
        ('Acta de entrega', {
            'fields': ('acta_pdf',),
            'description': 'El acta PDF se genera automáticamente al guardar la salida.',
        }),
        ('Auditoría (solo lectura)', {
            'fields': (
                'registrado_por', 'stock_aplicado',
                'tecnico_nombre', 'tecnico_usuario',
                'funcionario_nombre', 'funcionario_identificacion', 'funcionario_tipo',
                'creado_en',
            ),
            'classes': ('collapse',),
        }),
    )

    @admin.display(description='Detalle del producto en stock')
    def info_stock(self, obj):
        if not obj or not obj.stock_id:
            return '— (seleccione un producto de stock y guarde para ver el detalle)'
        s = obj.stock
        parts = [
            f'<b>Nombre:</b> {conditional_escape(s.producto or "—")}',
            f'<b>Marca:</b> {conditional_escape(s.marca or "—")}',
            f'<b>Referencia:</b> {conditional_escape(s.referencia_fabricante or "—")}',
            f'<b>Código de barras:</b> {conditional_escape(s.codigo_barras or "—")}',
            f'<b>Disponible:</b> {s.cantidad_actual} unidades',
        ]
        return mark_safe('<br>'.join(parts))

    def get_form(self, request, obj=None, **kwargs):
        request._salida_obj = obj
        return super().get_form(request, obj, **kwargs)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'funcionario_destino':
            from api.models import Persona
            obj = getattr(request, '_salida_obj', None)
            oficina_id = (
                request.POST.get('oficina_destino')
                or (obj.oficina_destino_id if obj else None)
            )
            if oficina_id:
                kwargs['queryset'] = Persona.objects.filter(
                    oficina_id=oficina_id, activo=True
                ).order_by('nombre')
            else:
                kwargs['queryset'] = Persona.objects.filter(activo=True).order_by(
                    'oficina__nombre', 'nombre'
                )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        if not obj.registrado_por:
            obj.registrado_por = request.user
        if not obj.tecnico_responsable:
            obj.tecnico_responsable = request.user
        super().save_model(request, obj, form, change)

