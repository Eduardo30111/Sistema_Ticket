"""Asegura que exista el usuario técnico sin sobrescribir contraseñas por defecto."""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


class Command(BaseCommand):
    help = "Crea (o ajusta flags) del usuario técnico sin cambiar contraseña existente"

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset-password',
            action='store_true',
            help='Si se usa, restablece la contraseña del técnico a tecnico123.',
        )

    def handle(self, *args, **options):
        email = "tecnico@example.com"
        password = "tecnico123"
        reset_password = bool(options.get('reset_password'))

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            user = User.objects.filter(username="tecnico").first()
        if user:
            user.email = email
            user.is_staff = True
            user.is_active = True

            if reset_password:
                user.set_password(password)

            user.save()

            if reset_password:
                self.stdout.write(self.style.SUCCESS(
                    f"Usuario técnico actualizado con nueva contraseña: {email} / {password}"
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"Usuario técnico actualizado sin cambiar contraseña: {email}"
                ))
        else:
            user = User.objects.create_user("tecnico", email=email, password=password)
            user.is_staff = True
            user.is_active = True
            user.save()
            self.stdout.write(self.style.SUCCESS(
                f"Usuario técnico creado: {email} / {password}"
            ))

        if reset_password:
            self.stdout.write("Entra al Portal Técnico con ese correo y contraseña temporal.")
        else:
            self.stdout.write("Entra al Portal Técnico con su contraseña actual.")
