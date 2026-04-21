from rest_framework import serializers

from .models import CategoriaInventario, IngresoInventario, SalidaInventario, StockInventario


class CategoriaInventarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaInventario
        fields = ['id', 'nombre', 'activa']


class StockInventarioSerializer(serializers.ModelSerializer):
    en_alerta = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockInventario
        fields = [
            'id',
            'categoria_catalogo',
            'categoria',
            'tipo',
            'producto',
            'marca',
            'modelo',
            'referencia_fabricante',
            'codigo_barras',
            'placa_interna',
            'numero_serie',
            'ubicacion_actual',
            'cantidad_actual',
            'stock_minimo',
            'en_alerta',
            'activo',
            'fecha_ultima_entrada',
            'fecha_ultima_salida',
            'creado_por',
            'actualizado_por',
            'creado_en',
            'actualizado_en',
        ]
        read_only_fields = (
            'cantidad_actual',
            'fecha_ultima_entrada',
            'fecha_ultima_salida',
            'creado_por',
            'actualizado_por',
            'creado_en',
            'actualizado_en',
        )


class IngresoInventarioSerializer(serializers.ModelSerializer):
    producto = serializers.CharField(source='stock.producto', read_only=True)

    class Meta:
        model = IngresoInventario
        fields = [
            'id',
            'stock',
            'producto',
            'cantidad',
            'fecha_entrada',
            'categoria_catalogo',
            'categoria_producto',
            'tipo_producto',
            'producto_nombre',
            'marca',
            'modelo',
            'referencia_fabricante',
            'codigo_barras',
            'numero_serie',
            'placa_interna',
            'lote',
            'fecha_vencimiento',
            'vencimiento_no_aplica',
            'estado_recepcion',
            'ubicacion_inicial',
            'recibido_por',
            'observaciones',
            'registrado_por',
            'stock_aplicado',
            'creado_en',
        ]
        read_only_fields = ('registrado_por', 'stock_aplicado', 'creado_en')
        extra_kwargs = {
            'stock': {'required': False, 'allow_null': True},
        }

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault('registrado_por', request.user)
            validated_data.setdefault('recibido_por', request.user)
        return super().create(validated_data)


class SalidaInventarioSerializer(serializers.ModelSerializer):
    producto = serializers.CharField(source='stock.producto', read_only=True)
    acta_pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = SalidaInventario
        fields = [
            'id',
            'stock',
            'producto',
            'cantidad',
            'motivo',
            'fecha_salida',
            'oficina_destino',
            'funcionario_destino',
            'tecnico_responsable',
            'tecnico_nombre',
            'tecnico_usuario',
            'funcionario_nombre',
            'funcionario_identificacion',
            'funcionario_tipo',
            'firma_tecnico_nombre',
            'firma_funcionario_nombre',
            'observaciones',
            'acta_pdf',
            'acta_pdf_url',
            'registrado_por',
            'stock_aplicado',
            'creado_en',
        ]
        read_only_fields = (
            'tecnico_nombre',
            'tecnico_usuario',
            'funcionario_nombre',
            'funcionario_identificacion',
            'funcionario_tipo',
            'acta_pdf',
            'acta_pdf_url',
            'registrado_por',
            'stock_aplicado',
            'creado_en',
        )

    def get_acta_pdf_url(self, obj):
        request = self.context.get('request')
        if not obj.acta_pdf:
            return ''
        if request:
            return request.build_absolute_uri(obj.acta_pdf.url)
        return obj.acta_pdf.url

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault('registrado_por', request.user)
            validated_data.setdefault('tecnico_responsable', request.user)
        return super().create(validated_data)
