from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import ValidationError

from cart.models import Cart, CartItem
from .models import Order, OrderItem
from .serializers import OrderCreateFromCartSerializer, OrderOutSerializer


class OrderCreateFromCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = OrderCreateFromCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        cart, _ = Cart.objects.get_or_create(user=request.user)

        cart_items = (
            CartItem.objects
            .filter(cart=cart)
            .select_related('product')
        )

        if not cart_items.exists():
            raise ValidationError({'detail': 'Cart is empty'})

        with transaction.atomic():
            order = Order.objects.create(
                user=request.user,

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

            for cart_item in cart_items.select_for_update():
                product = cart_item.product

                if not product or not product.is_active:
                    raise ValidationError({'detail': 'Product unavailable'})

                if product.stock < cart_item.quantity:
                    raise ValidationError({'detail': f'Not enough stock for product_id={product.id}'})

                price = product.price
                quantity = cart_item.quantity

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

            CartItem.objects.filter(cart=cart).delete()

        return Response({'order_id': order.id}, status=status.HTTP_201_CREATED)


class MyOrdersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        orders = (
            Order.objects
            .filter(user=request.user)
            .prefetch_related('items')
            .order_by('-id')[:50]
        )

        data = []
        for o in orders:
            items = []
            for it in o.items.all():
                items.append({
                    'id': it.id,
                    'product_id': it.product_id,
                    'product_name_snapshot': it.product_name_snapshot,
                    'price_snapshot': it.price_snapshot,
                    'quantity': it.quantity,
                })

            data.append({
                'id': o.id,
                'status': o.status,
                'total_amount': o.total_amount,
                'delivery_type': o.delivery_type,
                'delivery_city': o.delivery_city,
                'delivery_address_text': o.delivery_address_text,
                'pickup_point_data': o.pickup_point_data,
                'delivery_service': o.delivery_service,
                'delivery_price': o.delivery_price,
                'created_at': o.created_at,
                'items': items,
            })

        return Response(data, status=status.HTTP_200_OK)


class OrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, order_id: int):
        try:
            o = (
                Order.objects
                .prefetch_related('items')
                .get(id=order_id, user=request.user)
            )
        except Order.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        items = []
        for it in o.items.all():
            items.append({
                'id': it.id,
                'product_id': it.product_id,
                'product_name_snapshot': it.product_name_snapshot,
                'price_snapshot': it.price_snapshot,
                'quantity': it.quantity,
            })

        payload = {
            'id': o.id,
            'status': o.status,
            'total_amount': o.total_amount,
            'delivery_type': o.delivery_type,
            'delivery_city': o.delivery_city,
            'delivery_address_text': o.delivery_address_text,
            'pickup_point_data': o.pickup_point_data,
            'delivery_service': o.delivery_service,
            'delivery_price': o.delivery_price,
            'created_at': o.created_at,
            'items': items,
        }

        return Response(payload, status=status.HTTP_200_OK)
