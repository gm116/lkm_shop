from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from catalog.models import Category, Product


class CartApiTests(APITestCase):
    def setUp(self):
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='cart_user',
            email='cart_user@example.com',
            password=self.password,
        )

        category = Category.objects.create(name='Лаки', slug='laki', is_active=True)
        self.product = Product.objects.create(
            category=category,
            name='Лак A',
            slug='lak-a',
            sku='SKU-LAK-A',
            price=Decimal('1500.00'),
            stock=5,
            is_active=True,
        )
        self.product2 = Product.objects.create(
            category=category,
            name='Лак B',
            slug='lak-b',
            sku='SKU-LAK-B',
            price=Decimal('2500.00'),
            stock=2,
            is_active=True,
        )

    def _auth(self):
        self.client.force_authenticate(user=self.user)

    def test_get_cart_requires_auth_and_returns_cart_for_authorized(self):
        guest_response = self.client.get('/api/cart/')
        self.assertEqual(guest_response.status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth()
        authed_response = self.client.get('/api/cart/')
        self.assertEqual(authed_response.status_code, status.HTTP_200_OK)
        self.assertIn('items', authed_response.data)
        self.assertEqual(authed_response.data['items'], [])

    def test_cart_sync_merges_items_to_server_cart(self):
        self._auth()

        response = self.client.post(
            '/api/cart/sync/',
            {
                'items': [
                    {'product_id': self.product.id, 'quantity': 2},
                    {'product_id': self.product2.id, 'quantity': 1},
                ]
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {(row['product_id'], row['quantity']) for row in response.data['items']}
        self.assertEqual(rows, {(self.product.id, 2), (self.product2.id, 1)})

    def test_add_and_update_item_quantity(self):
        self._auth()

        add_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product.id, 'quantity': 1},
            format='json',
        )
        self.assertEqual(add_response.status_code, status.HTTP_200_OK)

        update_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product.id, 'quantity': 4},
            format='json',
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        item = CartItem.objects.get(cart__user=self.user, product=self.product)
        self.assertEqual(item.quantity, 4)

    def test_delete_item_and_clear_cart(self):
        self._auth()
        cart = Cart.objects.create(user=self.user)
        item1 = CartItem.objects.create(cart=cart, product=self.product, quantity=1)
        CartItem.objects.create(cart=cart, product=self.product2, quantity=2)

        delete_response = self.client.delete(f'/api/cart/items/{item1.id}/')
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

        clear_response = self.client.post('/api/cart/clear/', {}, format='json')
        self.assertEqual(clear_response.status_code, status.HTTP_200_OK)
        self.assertEqual(clear_response.data['items'], [])
        self.assertFalse(CartItem.objects.filter(cart=cart).exists())

    def test_negative_qty_rejected_and_zero_qty_does_not_add_item(self):
        self._auth()

        negative_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product.id, 'quantity': -1},
            format='json',
        )
        self.assertEqual(negative_response.status_code, status.HTTP_400_BAD_REQUEST)

        zero_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product.id, 'quantity': 0},
            format='json',
        )
        self.assertEqual(zero_response.status_code, status.HTTP_200_OK)
        self.assertEqual(zero_response.data['items'], [])
        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

    def test_cannot_add_more_than_stock(self):
        self._auth()

        response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product2.id, 'quantity': 3},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Недостаточно остатка', str(response.data))

    def test_stock_becomes_zero_after_add_is_handled_with_error(self):
        self._auth()

        add_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product2.id, 'quantity': 1},
            format='json',
        )
        self.assertEqual(add_response.status_code, status.HTTP_200_OK)

        self.product2.stock = 0
        self.product2.save(update_fields=['stock'])

        retry_response = self.client.post(
            '/api/cart/items/',
            {'product_id': self.product2.id, 'quantity': 2},
            format='json',
        )

        self.assertEqual(retry_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Недостаточно остатка', str(retry_response.data))

        item = CartItem.objects.get(cart__user=self.user, product=self.product2)
        self.assertEqual(item.quantity, 1)

    def test_delete_dead_item_does_not_crash(self):
        self._auth()
        cart = Cart.objects.create(user=self.user)
        item = CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        self.product.is_active = False
        self.product.stock = 0
        self.product.save(update_fields=['is_active', 'stock'])

        delete_response = self.client.delete(f'/api/cart/items/{item.id}/')
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CartItem.objects.filter(id=item.id).exists())

    def test_cart_total_recalculation_data_consistency(self):
        self._auth()

        self.client.post('/api/cart/items/', {'product_id': self.product.id, 'quantity': 2}, format='json')
        self.client.post('/api/cart/items/', {'product_id': self.product2.id, 'quantity': 1}, format='json')

        response = self.client.get('/api/cart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        calculated_total = sum(Decimal(str(row['price'])) * row['quantity'] for row in response.data['items'])
        self.assertEqual(calculated_total, Decimal('5500.00'))
