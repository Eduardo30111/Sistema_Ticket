from django.db.models import Count, F, Q
from rest_framework import permissions, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import Persona
from .models import IngresoInventario, SalidaInventario, StockInventario
from .serializers import IngresoInventarioSerializer, SalidaInventarioSerializer, StockInventarioSerializer


class StockInventarioViewSet(viewsets.ModelViewSet):
    queryset = StockInventario.objects.all()
    serializer_class = StockInventarioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        categoria = (self.request.query_params.get('categoria') or '').strip()
        tipo = (self.request.query_params.get('tipo') or '').strip()
        alerta = (self.request.query_params.get('alerta') or '').strip()

        if categoria:
            queryset = queryset.filter(categoria__icontains=categoria)
        if tipo:
            queryset = queryset.filter(tipo__icontains=tipo)
        if alerta in {'1', 'true', 'si'}:
            queryset = queryset.filter(cantidad_actual__lte=F('stock_minimo'))

        if not self.request.user.is_staff:
            queryset = queryset.filter(activo=True)
        return queryset.order_by('categoria', 'tipo', 'producto')

    def perform_create(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede crear stock base.')
        serializer.save(creado_por=self.request.user, actualizado_por=self.request.user)

    def perform_update(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede editar stock base.')
        serializer.save(actualizado_por=self.request.user)

    def perform_destroy(self, instance):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede eliminar stock base.')
        super().perform_destroy(instance)

    @action(detail=False, methods=['get'])
    def status(self, request):
        queryset = self.get_queryset()
        return Response({
            'total_items': queryset.count(),
            'en_alerta': queryset.filter(cantidad_actual__lte=F('stock_minimo')).count(),
            'stock_cero': queryset.filter(cantidad_actual=0).count(),
            'por_categoria': list(queryset.values('categoria').annotate(total=Count('id')).order_by('categoria')),
        })


class IngresoInventarioViewSet(viewsets.ModelViewSet):
    queryset = IngresoInventario.objects.select_related('stock', 'recibido_por', 'registrado_por').all()
    serializer_class = IngresoInventarioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not self.request.user.is_staff:
            return IngresoInventario.objects.none()
        queryset = super().get_queryset().order_by('-fecha_entrada')
        q = (self.request.query_params.get('q') or '').strip()
        tipo_documento = (self.request.query_params.get('tipo_documento') or '').strip()
        estado_recepcion = (self.request.query_params.get('estado_recepcion') or '').strip()

        if q:
            queryset = queryset.filter(
                Q(numero_serie__icontains=q)
                | Q(codigo_barras__icontains=q)
                | Q(stock__producto__icontains=q)
                | Q(producto_nombre__icontains=q)
            )
        if tipo_documento:
            queryset = queryset.filter(tipo_documento=tipo_documento)
        if estado_recepcion:
            queryset = queryset.filter(estado_recepcion=estado_recepcion)
        return queryset

    def perform_create(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede registrar ingresos.')
        serializer.save(registrado_por=self.request.user, recibido_por=self.request.user)


class SalidaInventarioViewSet(viewsets.ModelViewSet):
    queryset = SalidaInventario.objects.select_related(
        'stock', 'oficina_destino', 'funcionario_destino', 'tecnico_responsable', 'registrado_por'
    ).all()
    serializer_class = SalidaInventarioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset().order_by('-fecha_salida')
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(tecnico_responsable=self.request.user)

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user, tecnico_responsable=self.request.user)

    def perform_update(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede editar salidas registradas.')
        serializer.save()

    def perform_destroy(self, instance):
        if not self.request.user.is_staff:
            raise PermissionDenied('Solo el administrador puede eliminar salidas.')
        super().perform_destroy(instance)

    @action(detail=False, methods=['get'])
    def catalogo_entrega(self, request):
        oficina_id = request.query_params.get('oficina_id')
        personas_qs = Persona.objects.filter(activo=True, tipo__in=['FUNCIONARIO', 'CONTRATISTA'])
        if oficina_id:
            personas_qs = personas_qs.filter(oficina_id=oficina_id)

        personas_qs = personas_qs.select_related('oficina').order_by('nombre')
        oficinas = personas_qs.values('oficina_id', 'oficina__nombre').distinct()

        oficinas_data = [
            {'id': row['oficina_id'], 'nombre': row['oficina__nombre']}
            for row in oficinas
            if row['oficina_id']
        ]
        personas_data = [
            {
                'id': persona.id,
                'nombre': persona.nombre,
                'identificacion': persona.identificacion,
                'tipo': persona.tipo,
                'tipo_display': persona.get_tipo_display(),
                'oficina_id': persona.oficina_id,
                'oficina_nombre': persona.oficina.nombre if persona.oficina else '',
            }
            for persona in personas_qs
        ]
        return Response({'oficinas': oficinas_data, 'personas': personas_data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def status_module(request):
    stocks = StockInventario.objects.filter(activo=True)
    total_stocks = stocks.count()
    productos_alerta = stocks.filter(cantidad_actual__lte=F('stock_minimo')).count()

    return Response({
        'module': 'inventario',
        'name': 'Inventario',
        'status': 'operativo',
        'enabled': True,
        'metrics': {
            'items_stock': total_stocks,
            'items_en_alerta': productos_alerta,
        },
        'message': 'Módulo de Inventario operativo con Ingresos, Salidas y Stock.',
    })
