from django.db import migrations, models


def backfill_referencia_y_categoria(apps, schema_editor):
    Stock = apps.get_model('inventario', 'StockInventario')
    for s in Stock.objects.all():
        updates = []
        if not (s.referencia_fabricante or '').strip():
            s.referencia_fabricante = f'REF-{s.pk}'
            updates.append('referencia_fabricante')
        if not (s.categoria or '').strip():
            s.categoria = (s.tipo or '').strip() or 'Consumibles'
            updates.append('categoria')
        if updates:
            s.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0005_salidainventario_ticket_generar_acta'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockinventario',
            name='categoria',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.RunPython(backfill_referencia_y_categoria, migrations.RunPython.noop),
    ]
