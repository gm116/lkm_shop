from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import ValidationError

from .models import Cart, CartItem
from .serializers import CartSerializer, CartSyncSerializer, CartItemWriteSerializer


def serialize_cart(cart):
    items = []
    for item in cart.items.select_related('product').all():
        p = item.product
        items.append({
            'id': item.id,
            'quantity': item.quantity,
            'product_id': p.id,
            'product_name': p.name,
            'product_slug': p.slug,
            'price': p.price,
            'stock': p.stock,
        })

    return {
        'id': cart.id,
        'items': items,
    }


class CartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(serialize_cart(cart), status=status.HTTP_200_OK)


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

                item, created = CartItem.objects.select_for_update().get_or_create(
                    cart=cart,
                    product_id=product_id,
                    defaults={'quantity': qty},
                )

                if not created:
                    item.quantity = item.quantity + qty
                    item.save(update_fields=['quantity', 'updated_at'])

        return Response(serialize_cart(cart), status=status.HTTP_200_OK)


class CartItemUpsertView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CartItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)

            item, created = CartItem.objects.select_for_update().get_or_create(
                cart=cart,
                product_id=data['product_id'],
                defaults={'quantity': data['quantity']},
            )

            if not created:
                item.quantity = data['quantity']
                item.save(update_fields=['quantity', 'updated_at'])

        return Response(serialize_cart(cart), status=status.HTTP_200_OK)


class CartItemDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, item_id: int):
        cart, _ = Cart.objects.get_or_create(user=request.user)

        deleted, _ = CartItem.objects.filter(cart=cart, id=item_id).delete()
        if deleted == 0:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(status=status.HTTP_204_NO_CONTENT)


class CartClearView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        CartItem.objects.filter(cart=cart).delete()
        return Response(serialize_cart(cart), status=status.HTTP_200_OK)
