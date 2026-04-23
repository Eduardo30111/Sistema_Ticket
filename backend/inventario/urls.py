from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    SalidaInventarioViewSet,
    StockInventarioViewSet,
    status_module,
)


router = DefaultRouter()
router.register('stock', StockInventarioViewSet, basename='inventario-stock')
router.register('salidas', SalidaInventarioViewSet, basename='inventario-salida')


urlpatterns = [
    path('', status_module, name='inventario-status'),
]

urlpatterns += router.urls
