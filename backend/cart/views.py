from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import ValidationError

from .models import Cart, CartItem
from .serializers import CartSyncSerializer, CartItemWriteSerializer
from catalog.models import Product


def _product_image_url(request, product):
    img = product.images.all().first()
    if not img:
        return ''

    return img.image_url


def serialize_cart(request, cart):
    items = []
    qs = cart.items.select_related('product').prefetch_related('product__images').all()

    for item in qs:
        p = item.product
        items.append({
            'id': item.id,
            'quantity': item.quantity,

            'product_id': p.id,
            'product_name': getattr(p, 'name', ''),
            'product_slug': getattr(p, 'slug', '') or '',
            'image_url': _product_image_url(request, p),

            'price': getattr(p, 'price', 0),
            'stock': getattr(p, 'stock', 0),
        })

    return {'id': cart.id, 'items': items}


def _get_locked_product(product_id: int) -> Product:
    try:
        return Product.objects.select_for_update().get(id=product_id)
    except Product.DoesNotExist as exc:
        raise ValidationError({'detail': f'Товар не найден: {product_id}'}) from exc


def _validate_cart_quantity(product: Product, quantity: int):
    if not product.is_active:
        raise ValidationError({'detail': f'Товар недоступен: {product.id}'})

    if quantity > product.stock:
        raise ValidationError({'detail': f'Недостаточно остатка для товара id={product.id}'})


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(serialize_cart(request, cart), status=status.HTTP_200_OK)


class CartSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CartSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)

            for row in data['items']:
                product_id = row['product_id']
                qty = row['quantity']

                if qty <= 0:
                    continue

                product = _get_locked_product(product_id)

                item, created = CartItem.objects.select_for_update().get_or_create(
                    cart=cart,
                    product=product,
                    defaults={'quantity': qty},
                )

                if not created:
                    item.quantity = item.quantity + qty
                    _validate_cart_quantity(product, item.quantity)
                    item.save(update_fields=['quantity', 'updated_at'])
                else:
                    _validate_cart_quantity(product, item.quantity)

        return Response(serialize_cart(request, cart), status=status.HTTP_200_OK)


class CartItemUpsertView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CartItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)
            product = _get_locked_product(data['product_id'])
            _validate_cart_quantity(product, data['quantity'])

            item, created = CartItem.objects.select_for_update().get_or_create(
                cart=cart,
                product=product,
                defaults={'quantity': data['quantity']},
            )

            if not created:
                item.quantity = data['quantity']
                item.save(update_fields=['quantity', 'updated_at'])

        return Response(serialize_cart(request, cart), status=status.HTTP_200_OK)


class CartItemDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, item_id: int):
        cart, _ = Cart.objects.get_or_create(user=request.user)

        deleted, _ = CartItem.objects.filter(cart=cart, id=item_id).delete()
        if deleted == 0:
            return Response({'detail': 'Позиция корзины не найдена'}, status=status.HTTP_404_NOT_FOUND)

        return Response(status=status.HTTP_204_NO_CONTENT)


class CartClearView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        CartItem.objects.filter(cart=cart).delete()
        return Response(serialize_cart(request, cart), status=status.HTTP_200_OK)
