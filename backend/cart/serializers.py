from rest_framework import serializers


class CartItemWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class CartSyncSerializer(serializers.Serializer):
    items = serializers.ListField(child=CartItemWriteSerializer())


class CartItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    quantity = serializers.IntegerField()

    product_id = serializers.IntegerField()
    product_name = serializers.CharField()
    product_slug = serializers.CharField(allow_blank=True, required=False)
    image_url = serializers.CharField(allow_blank=True, required=False)

    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    stock = serializers.IntegerField()



class CartSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    items = CartItemSerializer(many=True)
