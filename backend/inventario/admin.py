from django import forms
from django.contrib import admin
from django.db import models
from django.utils.html import conditional_escape, mark_safe

from .models import CategoriaInventario, IngresoInventario, SalidaInventario, StockInventario


class IngresoInventarioAdminForm(forms.ModelForm):
    class Meta:
        model = IngresoInventario
        fields = '__all__'
        labels = {
            'tipo_producto': 'Referencia de producto',
            'vencimiento_no_aplica': 'Fecha de vencimiento: N/A (no aplica)',
        }


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
            return queryset.filter(cantidad_actual__lte=4)
        if value == 'NO':
            return queryset.filter(cantidad_actual__gt=4)
        return queryset


@admin.register(StockInventario)
class StockInventarioAdmin(admin.ModelAdmin):
    list_display = (
        'categoria',
        'tipo',
        'producto',
        'numero_serie',
        'cantidad_actual',
        'alerta_unidades',
        'activo',
    )
    list_filter = ('categoria', 'tipo', 'activo', StockAlertFilter)
    search_fields = (
        'producto',
        'categoria',
        'tipo',
        'numero_serie',
        'codigo_barras',
        'referencia_fabricante',
        'placa_interna',
        'marca',
        'modelo',
    )
    readonly_fields = ('creado_en', 'actualizado_en', 'fecha_ultima_entrada', 'fecha_ultima_salida')
    fields = (
        'categoria',
        'tipo',
        'producto',
        'marca',
        'modelo',
        'referencia_fabricante',
        'codigo_barras',
        'placa_interna',
        'numero_serie',
        'ubicacion_actual',
        'cantidad_actual',
        'activo',
        'creado_en',
        'actualizado_en',
        'fecha_ultima_entrada',
        'fecha_ultima_salida',
    )

    @admin.display(description='Alerta')
    def alerta_unidades(self, obj):
        if obj.cantidad_actual <= 4:
            return 'Quedan pocas unidades'
        return 'Stock suficiente'

    def save_model(self, request, obj, form, change):
        if not obj.creado_por:
            obj.creado_por = request.user
        obj.actualizado_por = request.user
        super().save_model(request, obj, form, change)


@admin.register(IngresoInventario)
class IngresoInventarioAdmin(admin.ModelAdmin):
    form = IngresoInventarioAdminForm
    list_display = (
        'fecha_entrada',
        'cantidad',
        'codigo_barras',
        'recibido_por',
        'registrado_por',
    )
    list_filter = (
        'fecha_entrada',
        'tipo_documento',
        'estado_recepcion',
        'stock__categoria',
        'stock__tipo',
        'oficina_receptora',
    )
    search_fields = (
        'stock__producto',
        'producto_nombre',
        'numero_serie',
        'codigo_barras',
        'placa_interna',
        'lote',
    )
    readonly_fields = ('creado_en', 'stock_aplicado')
    autocomplete_fields = ('categoria_catalogo', 'recibido_por', 'registrado_por', 'oficina_receptora')
    fields = (
        'cantidad',
        'fecha_entrada',
        'categoria_catalogo',
        'categoria_producto',
        'tipo_producto',
        'producto_nombre',
        'marca',
        'modelo',
        'referencia_fabricante',
        'numero_serie',
        'codigo_barras',
        'placa_interna',
        'lote',
        'fecha_vencimiento',
        'vencimiento_no_aplica',
        'observaciones',
        'recibido_por',
        'registrado_por',
        'stock_aplicado',
        'creado_en',
    )

    def save_model(self, request, obj, form, change):
        if not obj.registrado_por:
            obj.registrado_por = request.user
        if not obj.recibido_por:
            obj.recibido_por = request.user
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
        marca_mod = ' / '.join(filter(None, [s.marca, s.modelo]))
        parts = [
            f'<b>Categoría:</b> {conditional_escape(s.categoria or "—")}',
            f'<b>Tipo:</b> {conditional_escape(s.tipo)}',
            f'<b>Marca / Modelo:</b> {conditional_escape(marca_mod or "N/A")}',
            f'<b>Serial:</b> {conditional_escape(s.numero_serie or "N/A")}',
            f'<b>Cód. barras:</b> {conditional_escape(s.codigo_barras or "N/A")}',
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

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
