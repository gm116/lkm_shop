from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import ValidationError

from cart.models import Cart, CartItem
from catalog.models import Product, ProductImage
from .models import Order, OrderItem, OrderStatus
from .serializers import OrderCreateFromCartSerializer, serialize_order


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

        with transaction.atomic():
            cart_items = list(
                cart_items
                .select_for_update()
                .order_by('id')
            )

            if not cart_items:
                raise ValidationError({'detail': 'Cart is empty'})

            product_ids = [item.product_id for item in cart_items]
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }
            product_image_map = {}
            if product_ids:
                for image in (
                    ProductImage.objects
                    .filter(product_id__in=product_ids)
                    .order_by('product_id', 'sort_order', 'id')
                ):
                    product_image_map.setdefault(image.product_id, image.image_url)

            order = Order.objects.create(
                user=request.user,
                status=OrderStatus.NEW,

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

            for cart_item in cart_items:
                product = locked_products.get(cart_item.product_id)

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
                    image_url_snapshot=product_image_map.get(product.id, ''),
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
            .prefetch_related('items', 'payments')
            .order_by('-id')[:50]
        )

        return Response([serialize_order(order) for order in orders], status=status.HTTP_200_OK)


class OrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, order_id: int):
        try:
            o = (
                Order.objects
                .prefetch_related('items', 'payments')
                .get(id=order_id, user=request.user)
            )
        except Order.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(serialize_order(o), status=status.HTTP_200_OK)
