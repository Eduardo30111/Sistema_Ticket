# Generated migration for adding fecha_nueva_vigencia field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_remove_usuario_user_remove_ticket_usuario_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='solicitudreactivacioncontratista',
            name='fecha_nueva_vigencia',
            field=models.DateField(blank=True, help_text='Fecha hasta la cual será válida la reactivación', null=True),
        ),
    ]
