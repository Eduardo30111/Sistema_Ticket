from django.db import migrations, models
import django.db.models.deletion


def drop_unused_columns(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != 'sqlite':
        return

    with connection.cursor() as cursor:
        cursor.execute("PRAGMA table_info('inventario_stockinventario')")
        stock_columns = {row[1] for row in cursor.fetchall()}
        if 'mac_address' in stock_columns:
            cursor.execute('ALTER TABLE inventario_stockinventario DROP COLUMN mac_address')
        if 'imei' in stock_columns:
            cursor.execute('ALTER TABLE inventario_stockinventario DROP COLUMN imei')

        cursor.execute("PRAGMA table_info('inventario_ingresoinventario')")
        ingreso_columns = {row[1] for row in cursor.fetchall()}
        if 'mac_address' in ingreso_columns:
            cursor.execute('ALTER TABLE inventario_ingresoinventario DROP COLUMN mac_address')
        if 'imei' in ingreso_columns:
            cursor.execute('ALTER TABLE inventario_ingresoinventario DROP COLUMN imei')


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ingresoinventario',
            name='stock',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='ingresos', to='inventario.stockinventario'),
        ),
        migrations.RunPython(drop_unused_columns, migrations.RunPython.noop),
    ]
