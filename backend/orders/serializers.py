from rest_framework import serializers
from .models import DeliveryType


class PickupPointSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)


class OrderCreateFromCartSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    customer_phone = serializers.CharField(max_length=30)
    customer_email = serializers.EmailField(required=False, allow_blank=True)

    delivery_type = serializers.ChoiceField(choices=DeliveryType.choices)

    delivery_city = serializers.CharField(max_length=120, required=False, allow_blank=True)
    delivery_address_text = serializers.CharField(required=False, allow_blank=True)

    pickup_point_data = PickupPointSerializer(required=False)
    delivery_service = serializers.CharField(max_length=80, required=False, allow_blank=True)
    delivery_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)

    comment = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        delivery_type = attrs.get('delivery_type')

        if delivery_type == DeliveryType.COURIER:
            if not attrs.get('delivery_city'):
                raise serializers.ValidationError({'delivery_city': 'Required for courier'})
            if not attrs.get('delivery_address_text'):
                raise serializers.ValidationError({'delivery_address_text': 'Required for courier'})

        if delivery_type == DeliveryType.PICKUP:
            if not attrs.get('pickup_point_data'):
                raise serializers.ValidationError({'pickup_point_data': 'Required for pickup'})

        return attrs


class OrderItemOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_id = serializers.IntegerField(allow_null=True)
    product_name_snapshot = serializers.CharField()
    price_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2)
    quantity = serializers.IntegerField()


class OrderOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    delivery_type = serializers.CharField()
    delivery_city = serializers.CharField(allow_blank=True)
    delivery_address_text = serializers.CharField(allow_blank=True)

    pickup_point_data = serializers.JSONField(allow_null=True)
    delivery_service = serializers.CharField(allow_blank=True)
    delivery_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)

    created_at = serializers.DateTimeField()
    items = OrderItemOutSerializer(many=True)
