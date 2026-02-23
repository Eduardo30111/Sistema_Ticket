from django.db import models


class Usuario(models.Model):
    nombre = models.CharField(max_length=100)
    identificacion = models.CharField(max_length=50)
    correo = models.EmailField()
    telefono = models.CharField(max_length=20)
    activo = models.BooleanField(default=True)  # 👈 para saber si puede recibir tareas

    def __str__(self):
        return self.nombre


class Equipo(models.Model):
    tipo = models.CharField(max_length=50)
    serie = models.CharField(max_length=50)
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.tipo} - {self.serie}"


class Ticket(models.Model):
    ESTADOS = [
        ('ABIERTO', 'Abierto'),
        ('EN_PROCESO', 'En proceso'),
        ('CERRADO', 'Cerrado'),
    ]

    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE)
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE)
    descripcion = models.TextField()
    tipo_dano = models.CharField(max_length=50, blank=True, default='')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='ABIERTO')
    fecha = models.DateTimeField(auto_now_add=True)
    pdf = models.FileField(upload_to='tickets/', null=True, blank=True)
    atendido_por = models.CharField(max_length=100, null=True, blank=True)
    procedimiento = models.TextField(blank=True, default='')

    def __str__(self):
        return f"Ticket #{self.id} - {self.estado}"


# 🔥 NUEVO MÓDULO: ASIGNACIÓN DE TAREAS
class AsignacionTarea(models.Model):
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('EN_PROCESO', 'En proceso'),
        ('FINALIZADA', 'Finalizada'),
    ]

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name='tareas'
    )

    usuario_asignado = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        limit_choices_to={'activo': True},
        related_name='tareas_recibidas'
    )

    asignado_por = models.CharField(
        max_length=100,
        help_text="Nombre del usuario que asigna la tarea"
    )

    estado = models.CharField(
        max_length=20,
        choices=ESTADOS,
        default='PENDIENTE'
    )

    fecha_asignacion = models.DateTimeField(auto_now_add=True)
    fecha_finalizacion = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(blank=True, default='')

    def __str__(self):
        return f"Tarea #{self.id} - Ticket {self.ticket.id}"
