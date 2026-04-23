# Generated manually for public delay flag

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_delete_inventarioplaceholder_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='demorado_publico',
            field=models.BooleanField(
                default=False,
                help_text='Marcado cuando el solicitante avisa demora (sin técnico tras 1 h).',
            ),
        ),
    ]
