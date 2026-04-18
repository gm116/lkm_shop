from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import ValidationError

from cart.models import Cart, CartItem
from cart.views import serialize_cart
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
                raise ValidationError({'detail': 'Корзина пуста'})

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
                customer_email=data['customer_email'],

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
                    raise ValidationError({'detail': 'Товар недоступен'})

                if product.stock < cart_item.quantity:
                    raise ValidationError({'detail': f'Недостаточно остатка для товара id={product.id}'})

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
            return Response({'detail': 'Заказ не найден'}, status=status.HTTP_404_NOT_FOUND)

        return Response(serialize_order(o), status=status.HTTP_200_OK)


def _as_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() not in {'', '0', 'false', 'no', 'off'}
    return default


class RepeatOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id: int):
        replace_cart = _as_bool(request.data.get('replace'), default=True)

        try:
            source_order = (
                Order.objects
                .prefetch_related('items')
                .get(id=order_id, user=request.user)
            )
        except Order.DoesNotExist:
            return Response({'detail': 'Заказ не найден'}, status=status.HTTP_404_NOT_FOUND)

        source_items = list(source_order.items.all().order_by('id'))
        if not source_items:
            return Response({'detail': 'Невозможно повторить заказ: состав заказа пуст'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)
            if replace_cart:
                CartItem.objects.select_for_update().filter(cart=cart).delete()

            product_ids = [item.product_id for item in source_items if item.product_id]
            locked_products = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            added_positions = 0
            added_quantity = 0
            skipped_items = []
            partial_items = []

            for source_item in source_items:
                source_name = source_item.product_name_snapshot or f'Товар #{source_item.product_id or source_item.id}'
                product = locked_products.get(source_item.product_id) if source_item.product_id else None

                if not product:
                    skipped_items.append({
                        'product_id': source_item.product_id,
                        'name': source_name,
                        'reason': 'Товар удален из каталога',
                    })
                    continue

                if not product.is_active:
                    skipped_items.append({
                        'product_id': product.id,
                        'name': source_name,
                        'reason': 'Товар отключен и недоступен к заказу',
                    })
                    continue

                requested_qty = int(source_item.quantity or 0)
                available_qty = int(product.stock or 0)
                add_qty = min(requested_qty, available_qty)

                if add_qty <= 0:
                    skipped_items.append({
                        'product_id': product.id,
                        'name': source_name,
                        'reason': 'Нет в наличии',
                    })
                    continue

                cart_item = (
                    CartItem.objects
                    .select_for_update()
                    .filter(cart=cart, product=product)
                    .first()
                )

                if cart_item:
                    target_qty = min(int(cart_item.quantity) + add_qty, available_qty)
                    delta = max(0, target_qty - int(cart_item.quantity))
                    if delta <= 0:
                        skipped_items.append({
                            'product_id': product.id,
                            'name': source_name,
                            'reason': 'Не удалось увеличить количество: ограничение остатка',
                        })
                        continue
                    cart_item.quantity = target_qty
                    cart_item.save(update_fields=['quantity', 'updated_at'])
                    added_quantity += delta
                else:
                    CartItem.objects.create(cart=cart, product=product, quantity=add_qty)
                    added_quantity += add_qty

                added_positions += 1

                if add_qty < requested_qty:
                    partial_items.append({
                        'product_id': product.id,
                        'name': source_name,
                        'requested_quantity': requested_qty,
                        'added_quantity': add_qty,
                    })

            cart_payload = serialize_cart(request, cart)

        if added_positions == 0:
            return Response(
                {
                    'detail': 'Невозможно повторить заказ: все товары недоступны',
                    'cart': cart_payload,
                    'requested_positions': len(source_items),
                    'added_positions': 0,
                    'added_quantity': 0,
                    'partial_positions': len(partial_items),
                    'skipped_positions': len(skipped_items),
                    'partial_items': partial_items,
                    'skipped_items': skipped_items,
                },
                status=status.HTTP_409_CONFLICT,
            )

        detail = 'Товары из заказа добавлены в корзину'
        if partial_items or skipped_items:
            detail = 'Заказ добавлен в корзину частично'

        return Response(
            {
                'detail': detail,
                'cart': cart_payload,
                'requested_positions': len(source_items),
                'added_positions': added_positions,
                'added_quantity': added_quantity,
                'partial_positions': len(partial_items),
                'skipped_positions': len(skipped_items),
                'partial_items': partial_items,
                'skipped_items': skipped_items,
            },
            status=status.HTTP_200_OK,
        )
