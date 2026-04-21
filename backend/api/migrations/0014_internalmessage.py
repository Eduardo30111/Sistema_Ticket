from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_ticketmessage'),
        ('api', '0013_mascotafeedback_alter_asignaciontarea_estado_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='InternalMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='internal_messages_received', to=settings.AUTH_USER_MODEL)),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='internal_messages_sent', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Mensaje interno',
                'verbose_name_plural': 'Mensajes internos',
                'ordering': ['created_at'],
            },
        ),
    ]
