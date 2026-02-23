from django.contrib import admin
from .models import AsignacionTarea, Usuario, Equipo, Ticket

admin.site.register(Usuario)
admin.site.register(Equipo)
admin.site.register(Ticket)
admin.site.register(AsignacionTarea)