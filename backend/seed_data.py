"""
Script para crear datos de prueba automáticamente.
Corre con: python manage.py shell < seed_data.py
"""

from django.contrib.auth.models import User

# Crear superuser si no existe
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print("✅ Usuario admin creado")
else:
    print("ℹ️ Usuario admin ya existe")





