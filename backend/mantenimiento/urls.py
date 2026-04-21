from django.urls import path

from .views import status_module


urlpatterns = [
    path('', status_module, name='mantenimiento-status'),
]
