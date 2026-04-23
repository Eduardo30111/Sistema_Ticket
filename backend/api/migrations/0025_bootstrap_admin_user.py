from django.db import migrations
from django.contrib.auth.hashers import make_password


def bootstrap_admin_user(apps, schema_editor):
    """
    Crea/actualiza un superusuario por defecto para entornos donde no hay shell
    interactiva (p. ej. planes free). Es idempotente.
    """
    User = apps.get_model('auth', 'User')

    username = 'admin'
    email = 'admin@local.com'
    password = 'admin123'

    user, _created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': email,
            'is_staff': True,
            'is_superuser': True,
            'is_active': True,
        },
    )
    user.email = email
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.password = make_password(password)
    user.save(update_fields=['email', 'is_staff', 'is_superuser', 'is_active', 'password'])


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0024_ticket_numero_ficha_consecutivo'),
    ]

    operations = [
        migrations.RunPython(bootstrap_admin_user, migrations.RunPython.noop),
    ]

