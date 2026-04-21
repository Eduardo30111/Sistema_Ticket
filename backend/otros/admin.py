from django.contrib import admin

from .models import AsignacionTareaOtros, EquipoOtros, TicketOtros


@admin.register(EquipoOtros)
class EquipoOtrosAdmin(admin.ModelAdmin):
    list_display = ['tipo', 'serie', 'marca', 'modelo', 'fecha_registro']
    search_fields = ['serie', 'marca', 'modelo']
    list_filter = ['tipo', 'fecha_registro']


@admin.register(TicketOtros)
class TicketOtrosAdmin(admin.ModelAdmin):
    list_display = ['id', 'solicitante_nombre', 'solicitante_identificacion', 'equipo', 'estado', 'asignado', 'fecha']
    search_fields = ['solicitante_nombre', 'solicitante_identificacion', 'equipo__serie', 'descripcion']
    list_filter = ['estado', 'asignado', 'fecha']


@admin.register(AsignacionTareaOtros)
class AsignacionTareaOtrosAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'usuario_asignado', 'estado', 'prioridad', 'fecha_asignacion']
    search_fields = ['ticket__id', 'usuario_asignado__username', 'asignado_por']
    list_filter = ['estado', 'prioridad', 'fecha_asignacion']
