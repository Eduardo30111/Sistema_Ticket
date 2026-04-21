from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_ticket_formato_servicio'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipo',
            name='fecha_registro',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True),
        ),
        migrations.AddField(
            model_name='usuario',
            name='fecha_registro',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True),
        ),
    ]
