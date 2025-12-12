from django.apps import apps
from django.db import transaction

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError

from .models import Order, OrderItem
from .serializers import OrderCreateSerializer


class OrderCreateView(APIView):
    def post(self, request):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        Product = apps.get_model('catalog', 'Product')

        with transaction.atomic():
            order = Order.objects.create(
                user=request.user if request.user.is_authenticated else None,
                customer_name=data['customer_name'],
                customer_phone=data['customer_phone'],
                customer_email=data.get('customer_email', ''),
                delivery_type=data['delivery_type'],
                delivery_city=data.get('delivery_city', ''),
                delivery_address_text=data.get('delivery_address_text', ''),
                pickup_point_data=data.get('pickup_point_data'),
                delivery_service=data.get('delivery_service', ''),
                delivery_price=data.get('delivery_price'),
                comment=data.get('comment', ''),
            )

            total = 0

            for item in data['items']:
                quantity = item['quantity']

                try:
                    product = Product.objects.select_for_update().get(
                        id=item['product_id'],
                        is_active=True
                    )
                except Product.DoesNotExist:
                    raise ValidationError({
                        'items': f'Product with id={item["product_id"]} not found'
                    })

                if product.stock < quantity:
                    raise ValidationError({
                        'items': f'Not enough stock for product_id={product.id}'
                    })

                price = product.price

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name_snapshot=product.name,
                    price_snapshot=price,
                    quantity=quantity,
                )

                product.stock -= quantity
                product.save(update_fields=['stock'])

                total += price * quantity

            if order.delivery_price:
                total += order.delivery_price

            order.total_amount = total
            order.save(update_fields=['total_amount'])

        return Response(
            {'order_id': order.id},
            status=status.HTTP_201_CREATED
        )
