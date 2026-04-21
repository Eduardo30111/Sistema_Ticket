from api.models import AsignacionTarea, Equipo, Ticket


class EquipoOtros(Equipo):
    class Meta:
        proxy = True
        app_label = 'otros'
        verbose_name = 'Equipos'
        verbose_name_plural = 'Equipos'


class TicketOtros(Ticket):
    class Meta:
        proxy = True
        app_label = 'otros'
        verbose_name = 'Tickets'
        verbose_name_plural = 'Tickets'


class AsignacionTareaOtros(AsignacionTarea):
    class Meta:
        proxy = True
        app_label = 'otros'
        verbose_name = 'Asignaciones de tarea'
        verbose_name_plural = 'Asignaciones de tarea'


