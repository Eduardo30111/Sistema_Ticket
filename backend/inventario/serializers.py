from rest_framework import serializers

from .models import CategoriaInventario, SalidaInventario, StockInventario


class CategoriaInventarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaInventario
        fields = ['id', 'nombre', 'activa']


class StockInventarioSerializer(serializers.ModelSerializer):
    en_alerta = serializers.SerializerMethodField()

    class Meta:
        model = StockInventario
        fields = [
            'id',
            'producto',
            'marca',
            'referencia_fabricante',
            'codigo_barras',
            'cantidad_actual',
            'tipo',
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
            'tipo',
            'fecha_ultima_entrada',
            'fecha_ultima_salida',
            'creado_por',
            'actualizado_por',
            'creado_en',
            'actualizado_en',
            'en_alerta',
        )

    def get_en_alerta(self, obj):
        return obj.en_alerta

    def create(self, validated_data):
        request = self.context.get('request')
        user = request.user if request and getattr(request, 'user', None) and request.user.is_authenticated else None

        dup = StockInventario.buscar_fila_para_sumar(
            validated_data.get('referencia_fabricante', ''),
            validated_data.get('numero_serie', ''),
            validated_data.get('codigo_barras', ''),
            validated_data.get('tipo', ''),
        )
        if dup:
            qty = validated_data.get('cantidad_actual') or 0
            dup.registrar_ingreso(qty)
            if user:
                dup.actualizado_por = user
                dup.save(update_fields=['actualizado_por'])
            return dup

        instance = StockInventario(**validated_data)
        instance.full_clean()
        instance.save()
        return instance

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.full_clean()
        instance.save()
        return instance


class SalidaInventarioSerializer(serializers.ModelSerializer):
    producto = serializers.SerializerMethodField()
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

    def get_producto(self, obj):
        if obj.stock_id:
            return (obj.stock.producto or obj.stock.marca or '').strip()
        return ''

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
