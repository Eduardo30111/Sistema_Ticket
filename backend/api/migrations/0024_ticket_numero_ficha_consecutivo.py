# Generated manually for ficha técnica PDF consecutivo

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_asignaciontarea_plazo_hasta'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConsecutivoDocumentoTIC',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ultimo_numero', models.PositiveIntegerField(default=0)),
            ],
            options={
                'verbose_name': 'Consecutivo documento TIC',
                'verbose_name_plural': 'Consecutivos documento TIC',
            },
        ),
        migrations.AddField(
            model_name='ticket',
            name='numero_ficha_tecnica',
            field=models.PositiveIntegerField(blank=True, null=True, unique=True, db_index=True),
        ),
    ]
