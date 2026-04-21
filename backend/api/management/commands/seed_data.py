from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from api.models import Equipo

class Command(BaseCommand):
    help = 'Crear datos de prueba para el sistema de tickets'

    def handle(self, *args, **options):
        # Crear superuser si no existe
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
            self.stdout.write(self.style.SUCCESS('✅ Usuario admin creado'))
        else:
            self.stdout.write(self.style.WARNING('ℹ️ Usuario admin ya existe'))

        # Usuario técnico para login por email (Portal Técnico)
        u = User.objects.filter(email__iexact='tecnico@example.com').first()
        if u:
            u.set_password('tecnico123')
            u.is_staff = True
            u.is_active = True
            u.save()
            self.stdout.write(self.style.SUCCESS('✅ Usuario técnico actualizado (tecnico@example.com / tecnico123)'))
        else:
            u = User.objects.create_user('tecnico', 'tecnico@example.com', 'tecnico123')
            u.is_staff = True
            u.save()
            self.stdout.write(self.style.SUCCESS('✅ Usuario técnico creado (tecnico@example.com / tecnico123)'))

        # Crear equipos de prueba
        equipos_data = [
            {'tipo': 'Laptop', 'serie': 'LAP-001', 'marca': 'Dell', 'modelo': 'Inspiron 15'},
            {'tipo': 'Desktop', 'serie': 'DES-001', 'marca': 'HP', 'modelo': 'ProDesk 400'},
            {'tipo': 'Impresora', 'serie': 'IMP-001', 'marca': 'Canon', 'modelo': 'MF445dw'},
        ]

        for datos in equipos_data:
            if not Equipo.objects.filter(serie=datos['serie']).exists():
                Equipo.objects.create(**datos)
                self.stdout.write(self.style.SUCCESS(f"✅ Equipo '{datos['tipo']}' ({datos['serie']}) creado"))

        self.stdout.write(self.style.SUCCESS('\n✨ Datos de prueba creados exitosamente'))
        self.stdout.write(self.style.WARNING('\nCredenciales de login:'))
        self.stdout.write('- Admin: username admin / password admin123')
        self.stdout.write('- Portal técnico (email): tecnico@example.com / tecnico123')
