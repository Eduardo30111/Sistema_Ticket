from django.contrib.auth.models import User
from api.models import Equipo

# Crear superuser si no existe
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print("Usuario admin creado")
else:
    print("Usuario admin ya existe")

# Usuario técnico para login por email (Portal Técnico)
if not User.objects.filter(email='tecnico@example.com').exists():
    u = User.objects.create_user('tecnico', 'tecnico@example.com', 'tecnico123')
    u.is_staff = True
    u.save()
    print("Usuario técnico creado (tecnico@example.com / tecnico123)")
else:
    print("Usuario técnico ya existe")

# Crear equipos de prueba
equipos_data = [
    {'tipo': 'Laptop', 'serie': 'LAP-001', 'marca': 'Dell', 'modelo': 'Inspiron 15'},
    {'tipo': 'Desktop', 'serie': 'DES-001', 'marca': 'HP', 'modelo': 'ProDesk 400'},
    {'tipo': 'Impresora', 'serie': 'IMP-001', 'marca': 'Canon', 'modelo': 'MF445dw'},
]

for datos in equipos_data:
    if not Equipo.objects.filter(serie=datos['serie']).exists():
        Equipo.objects.create(**datos)
        print(f"Equipo '{datos['tipo']}' ({datos['serie']}) creado")

print("\nDatos de prueba creados exitosamente")
print("\nCredenciales de login:")
print("Admin: admin / admin123")
print("Técnico: tecnico@example.com / tecnico123")