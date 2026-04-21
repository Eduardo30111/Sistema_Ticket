from django.contrib import admin

from .models import MantenimientoPlaceholder


@admin.register(MantenimientoPlaceholder)
class MantenimientoPlaceholderAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'creado_en', 'actualizado_en']
    readonly_fields = ['creado_en', 'actualizado_en']
    search_fields = ['nombre']
