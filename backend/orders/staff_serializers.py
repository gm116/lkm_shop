from rest_framework import serializers
from .models import OrderStatus


class StaffOrderItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_id = serializers.IntegerField(allow_null=True)
    product_name_snapshot = serializers.CharField()
    price_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2)
    quantity = serializers.IntegerField()


class StaffOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    customer_name = serializers.CharField()
    customer_phone = serializers.CharField()
    customer_email = serializers.CharField(allow_blank=True)

    delivery_type = serializers.CharField()
    delivery_city = serializers.CharField(allow_blank=True)
    delivery_address_text = serializers.CharField(allow_blank=True)

    pickup_point_data = serializers.JSONField(allow_null=True)
    delivery_service = serializers.CharField(allow_blank=True)
    delivery_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)

    comment = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    items = StaffOrderItemSerializer(many=True)


class StaffOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)