from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_ticket_demorado_publico'),
    ]

    operations = [
        migrations.AddField(
            model_name='asignaciontarea',
            name='plazo_hasta',
            field=models.DateTimeField(
                blank=True,
                help_text='Opcional. Lo define el administrador; el técnico ve el tiempo restante en el portal.',
                null=True,
                verbose_name='Plazo de atención (fecha y hora)',
            ),
        ),
        migrations.AlterField(
            model_name='asignaciontarea',
            name='fecha_finalizacion',
            field=models.DateTimeField(
                blank=True,
                help_text='Se registra automáticamente al marcar la tarea como terminada.',
                null=True,
                verbose_name='Fecha de finalización real',
            ),
        ),
    ]
