from django.db import models


class MantenimientoPlaceholder(models.Model):
    nombre = models.CharField(max_length=120, default='Módulo de Mantenimiento')
    descripcion = models.TextField(blank=True, default='')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'api'
        verbose_name = 'Mantenimiento'
        verbose_name_plural = 'Mantenimiento'

    def __str__(self):
        return self.nombre
