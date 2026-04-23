from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_delete_inventarioplaceholder_and_more'),
        ('inventario', '0004_categoriainventario_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='salidainventario',
            name='generar_acta',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='salidainventario',
            name='ticket',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='salidas_inventario',
                to='api.ticket',
            ),
        ),
    ]
