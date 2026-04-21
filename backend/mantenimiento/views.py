from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def status_module(request):
    return Response({
        'module': 'mantenimiento',
        'name': 'Mantenimiento',
        'status': 'blank',
        'enabled': True,
        'message': 'El módulo de Mantenimiento existe en backend y permanece sin lógica funcional por ahora.',
    }, status=status.HTTP_200_OK)
