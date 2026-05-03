from rest_framework import serializers

class CreatePaymentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()

class CreatePaymentResponseSerializer(serializers.Serializer):
    confirmation_url = serializers.URLField()
    payment_id = serializers.CharField()
    status = serializers.CharField()
