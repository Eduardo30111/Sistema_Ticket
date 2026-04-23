from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0007_stock_fk_set_null_alert_umbral'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockinventario',
            name='producto',
            field=models.CharField(blank=True, default='', max_length=160),
        ),
        migrations.AlterField(
            model_name='stockinventario',
            name='tipo',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
