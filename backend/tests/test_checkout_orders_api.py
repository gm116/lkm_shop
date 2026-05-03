import threading
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import close_old_connections
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from cart.models import Cart, CartItem
from catalog.models import Category, Product
from orders.models import Order, OrderStatus


class CheckoutOrderCreateApiTests(APITestCase):
    def setUp(self):
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='checkout_user',
            email='checkout_user@example.com',
            password=self.password,
        )
        self.client.force_authenticate(user=self.user)

        category = Category.objects.create(name='Лаки', slug='laki-checkout', is_active=True)
        self.product = Product.objects.create(
            category=category,
            name='Лак HS',
            slug='lak-hs-checkout',
            sku='SKU-LAK-HS-CHECKOUT',
            price=Decimal('13098.00'),
            stock=5,
            is_active=True,
        )

    def _fill_cart(self, quantity=1):
        cart, _ = Cart.objects.get_or_create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=quantity)
        return cart

    def _pickup_payload(self, **overrides):
        payload = {
            'customer_name': 'Петр Иванов',
            'customer_phone': '+7 (999) 111-22-33',
            'customer_email': 'petr@example.com',
            'delivery_type': 'store_pickup',
            'pickup_point_data': {
                'id': 'store_default',
                'name': 'Самовывоз',
                'address': 'Адрес магазина',
            },
            'comment': 'Тестовый заказ',
        }
        payload.update(overrides)
        return payload

    def _pvz_payload(self, **overrides):
        payload = {
            'customer_name': 'Петр Иванов',
            'customer_phone': '+7 (999) 111-22-33',
            'customer_email': 'petr@example.com',
            'delivery_type': 'pvz',
            'delivery_service': 'cdek',
            'delivery_city': 'Казань',
            'pickup_point_data': {
                'id': 'cdek_pending',
                'name': 'ПВЗ (СДЭК)',
                'address': 'Казань, уточняется менеджером',
            },
            'delivery_address_text': 'Доставка до ПВЗ',
            'comment': '',
        }
        payload.update(overrides)
        return payload

    def test_checkout_requires_authentication(self):
        guest_client = APIClient()
        response = guest_client.post('/api/orders/create-from-cart/', self._pickup_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_email_is_required_in_checkout(self):
        self._fill_cart(quantity=1)

        response = self.client.post(
            '/api/orders/create-from-cart/',
            self._pickup_payload(customer_email=''),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer_email', response.data)

    def test_name_phone_email_validation_in_checkout(self):
        self._fill_cart(quantity=1)

        response_email_name = self.client.post(
            '/api/orders/create-from-cart/',
            self._pickup_payload(
                customer_name='   ',
                customer_phone='+7 (999) 111-22-33',
                customer_email='bad-email',
            ),
            format='json',
        )

        self.assertEqual(response_email_name.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer_name', response_email_name.data)
        self.assertIn('customer_email', response_email_name.data)

        response_phone = self.client.post(
            '/api/orders/create-from-cart/',
            self._pickup_payload(
                customer_name='Петр Иванов',
                customer_phone='123',
                customer_email='petr@example.com',
            ),
            format='json',
        )
        self.assertEqual(response_phone.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer_phone', response_phone.data)

    def test_cannot_create_order_with_empty_cart(self):
        response = self.client.post('/api/orders/create-from-cart/', self._pickup_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Корзина пуста')

    def test_delivery_modes_store_pickup_and_pvz_are_supported(self):
        self._fill_cart(quantity=1)

        store_response = self.client.post('/api/orders/create-from-cart/', self._pickup_payload(), format='json')
        self.assertEqual(store_response.status_code, status.HTTP_201_CREATED)
        order_store = Order.objects.get(public_id=store_response.data['order_id'])
        self.assertEqual(order_store.delivery_type, 'store_pickup')

        self.product.stock = 5
        self.product.save(update_fields=['stock'])
        cart, _ = Cart.objects.get_or_create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        pvz_response = self.client.post('/api/orders/create-from-cart/', self._pvz_payload(), format='json')
        self.assertEqual(pvz_response.status_code, status.HTTP_201_CREATED)
        order_pvz = Order.objects.get(public_id=pvz_response.data['order_id'])
        self.assertEqual(order_pvz.delivery_type, 'pvz')
        self.assertEqual(order_pvz.delivery_service, 'cdek')
        self.assertEqual(order_pvz.delivery_city, 'Казань')

    def test_courier_option_is_rejected_by_backend(self):
        self._fill_cart(quantity=1)

        response = self.client.post(
            '/api/orders/create-from-cart/',
            self._pickup_payload(delivery_type='courier'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Доставка курьером недоступна', str(response.data))

    def test_pvz_requires_delivery_service_and_city(self):
        self._fill_cart(quantity=1)

        response_no_service = self.client.post(
            '/api/orders/create-from-cart/',
            self._pvz_payload(delivery_service=''),
            format='json',
        )
        self.assertEqual(response_no_service.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('delivery_service', response_no_service.data)

        response_no_city = self.client.post(
            '/api/orders/create-from-cart/',
            self._pvz_payload(delivery_city='  '),
            format='json',
        )
        self.assertEqual(response_no_city.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('delivery_city', response_no_city.data)

    def test_create_order_reserves_stock_and_clears_cart(self):
        self._fill_cart(quantity=3)

        response = self.client.post('/api/orders/create-from-cart/', self._pickup_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(public_id=response.data['order_id'])
        self.product.refresh_from_db()

        self.assertEqual(self.product.stock, 2)
        self.assertEqual(order.total_amount, Decimal('39294.00'))
        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

    def test_new_order_status_and_payment_expires_at(self):
        self._fill_cart(quantity=1)

        response = self.client.post('/api/orders/create-from-cart/', self._pickup_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(public_id=response.data['order_id'])

        self.assertEqual(order.status, OrderStatus.NEW)
        self.assertIsNone(order.payment_expires_at)


class CheckoutRaceConditionTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.password = 'StrongPass123!'
        self.user1 = User.objects.create_user(username='buyer_1', email='buyer_1@example.com', password=self.password)
        self.user2 = User.objects.create_user(username='buyer_2', email='buyer_2@example.com', password=self.password)

        category = Category.objects.create(name='Грунты', slug='grunty-race', is_active=True)
        self.product = Product.objects.create(
            category=category,
            name='Грунт 2K',
            slug='grunt-2k-race',
            sku='SKU-RACE-1',
            price=Decimal('1000.00'),
            stock=1,
            is_active=True,
        )

        for user in (self.user1, self.user2):
            cart = Cart.objects.create(user=user)
            CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        self.payload = {
            'customer_name': 'Покупатель',
            'customer_phone': '+7 (999) 111-22-33',
            'customer_email': 'buyer@example.com',
            'delivery_type': 'store_pickup',
            'pickup_point_data': {
                'id': 'store_default',
                'name': 'Самовывоз',
                'address': 'Адрес магазина',
            },
        }

    def _request_in_thread(self, user, barrier, result_bucket, idx):
        close_old_connections()
        client = APIClient()
        client.force_authenticate(user=user)
        barrier.wait()
        response = client.post('/api/orders/create-from-cart/', self.payload, format='json')
        result_bucket[idx] = (response.status_code, dict(response.data))
        close_old_connections()

    def test_two_buyers_compete_for_last_item_one_succeeds_one_fails(self):
        barrier = threading.Barrier(2)
        results = [None, None]

        t1 = threading.Thread(target=self._request_in_thread, args=(self.user1, barrier, results, 0))
        t2 = threading.Thread(target=self._request_in_thread, args=(self.user2, barrier, results, 1))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        statuses = sorted([results[0][0], results[1][0]])
        self.assertEqual(statuses, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])

        error_payload = results[0][1] if results[0][0] == status.HTTP_400_BAD_REQUEST else results[1][1]
        self.assertIn('Недостаточно остатка', error_payload.get('detail', ''))

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 0)
        self.assertEqual(Order.objects.count(), 1)
