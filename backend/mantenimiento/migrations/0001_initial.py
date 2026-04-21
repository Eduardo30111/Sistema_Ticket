from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='MantenimientoPlaceholder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(default='Módulo de Mantenimiento', max_length=120)),
                ('descripcion', models.TextField(blank=True, default='')),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Mantenimiento',
                'verbose_name_plural': 'Mantenimiento',
            },
        ),
    ]
