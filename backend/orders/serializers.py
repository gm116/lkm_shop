from rest_framework import serializers
from payments.models import Payment
from .models import DeliveryType, Order


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

        if delivery_type == DeliveryType.STORE_PICKUP:
            if not attrs.get('pickup_point_data'):
                raise serializers.ValidationError({'pickup_point_data': 'Required for pickup'})

        return attrs


class OrderItemOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_id = serializers.IntegerField(allow_null=True)
    product_name_snapshot = serializers.CharField()
    image_url_snapshot = serializers.CharField(allow_blank=True)
    price_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2)
    quantity = serializers.IntegerField()


class OrderOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    payment_succeeded = serializers.BooleanField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    delivery_type = serializers.CharField()
    delivery_city = serializers.CharField(allow_blank=True)
    delivery_address_text = serializers.CharField(allow_blank=True)

    pickup_point_data = serializers.JSONField(allow_null=True)
    delivery_service = serializers.CharField(allow_blank=True)
    delivery_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)

    created_at = serializers.DateTimeField()
    items = OrderItemOutSerializer(many=True)


class StaffOrderOutSerializer(OrderOutSerializer):
    customer_name = serializers.CharField()
    customer_phone = serializers.CharField()
    customer_email = serializers.CharField(allow_blank=True)
    comment = serializers.CharField(allow_blank=True)
    updated_at = serializers.DateTimeField()


def serialize_order_item(item):
    return {
        'id': item.id,
        'product_id': item.product_id,
        'product_name_snapshot': item.product_name_snapshot,
        'image_url_snapshot': item.image_url_snapshot,
        'price_snapshot': item.price_snapshot,
        'quantity': item.quantity,
    }


def _payment_succeeded(order: Order) -> bool:
    prefetched = getattr(order, '_prefetched_objects_cache', {}) or {}
    payments = prefetched.get('payments')
    if payments is not None:
        return any(payment.status == Payment.Status.SUCCEEDED for payment in payments)
    return order.payments.filter(status=Payment.Status.SUCCEEDED).exists()


def serialize_order(order: Order, include_customer: bool = False):
    payload = {
        'id': order.id,
        'status': order.status,
        'payment_succeeded': _payment_succeeded(order),
        'total_amount': order.total_amount,
        'delivery_type': order.delivery_type,
        'delivery_city': order.delivery_city,
        'delivery_address_text': order.delivery_address_text,
        'pickup_point_data': order.pickup_point_data,
        'delivery_service': order.delivery_service,
        'delivery_price': order.delivery_price,
        'created_at': order.created_at,
        'updated_at': order.updated_at,
        'items': [serialize_order_item(item) for item in order.items.all()],
    }

    if include_customer:
        payload.update({
            'customer_name': order.customer_name,
            'customer_phone': order.customer_phone,
            'customer_email': order.customer_email,
            'comment': order.comment,
        })

    return payload
