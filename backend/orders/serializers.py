from rest_framework import serializers
from .models import DeliveryType


class OrderItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    customer_phone = serializers.CharField(max_length=30)
    customer_email = serializers.EmailField(required=False, allow_blank=True)

    delivery_type = serializers.ChoiceField(choices=DeliveryType.choices)
    delivery_city = serializers.CharField(required=False, allow_blank=True)
    delivery_address_text = serializers.CharField(required=False, allow_blank=True)

    pickup_point_data = serializers.JSONField(required=False)
    delivery_service = serializers.CharField(required=False, allow_blank=True)
    delivery_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)

    comment = serializers.CharField(required=False, allow_blank=True)

    items = OrderItemCreateSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('Cart is empty')
        return items