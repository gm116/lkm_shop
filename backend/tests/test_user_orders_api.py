from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from catalog.models import Category, Product
from orders.models import DeliveryType, Order, OrderItem, OrderStatus


class UserOrdersApiTests(APITestCase):
    def setUp(self):
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(username='orders_user', email='orders_user@example.com', password=self.password)
        self.other_user = User.objects.create_user(username='orders_other', email='orders_other@example.com', password=self.password)
        self.client.force_authenticate(user=self.user)

        category = Category.objects.create(name='Автоэмали', slug='autoemali-orders', is_active=True)
        self.product_a = Product.objects.create(
            category=category,
            name='Лак A',
            slug='lak-a-orders',
            sku='SKU-LAK-A-ORDERS',
            price=Decimal('1000.00'),
            stock=10,
            is_active=True,
        )
        self.product_b = Product.objects.create(
            category=category,
            name='Лак B',
            slug='lak-b-orders',
            sku='SKU-LAK-B-ORDERS',
            price=Decimal('2000.00'),
            stock=10,
            is_active=True,
        )

    def _create_order(self, user, *, status_value=OrderStatus.NEW, items=None):
        order = Order.objects.create(
            user=user,
            status=status_value,
            customer_name='Покупатель',
            customer_phone='+7 (999) 111-22-33',
            customer_email='buyer@example.com',
            delivery_type=DeliveryType.STORE_PICKUP,
            pickup_point_data={'id': 'store_default', 'name': 'Самовывоз', 'address': 'Адрес магазина'},
            total_amount=Decimal('0.00'),
        )
        total = Decimal('0.00')
        for row in (items or []):
            product = row.get('product')
            price = Decimal(str(row.get('price')))
            qty = int(row.get('qty', 1))
            OrderItem.objects.create(
                order=order,
                product=product,
                product_name_snapshot=row.get('name') or (product.name if product else 'Удаленный товар'),
                image_url_snapshot='https://example.com/image.jpg',
                price_snapshot=price,
                quantity=qty,
            )
            total += price * qty
        order.total_amount = total
        order.save(update_fields=['total_amount'])
        return order

    def test_my_orders_returns_only_current_user_orders(self):
        my_order_1 = self._create_order(self.user, items=[{'product': self.product_a, 'price': '1000.00', 'qty': 1}])
        my_order_2 = self._create_order(self.user, items=[{'product': self.product_b, 'price': '2000.00', 'qty': 2}])
        self._create_order(self.other_user, items=[{'product': self.product_a, 'price': '1000.00', 'qty': 1}])

        response = self.client.get('/api/orders/my/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row['public_id'] for row in response.data}
        self.assertEqual(ids, {str(my_order_1.public_id), str(my_order_2.public_id)})

    def test_order_detail_returns_own_order_details(self):
        order = self._create_order(
            self.user,
            items=[
                {'product': self.product_a, 'price': '1000.00', 'qty': 2},
                {'product': self.product_b, 'price': '2000.00', 'qty': 1},
            ],
        )

        response = self.client.get(f'/api/orders/{order.public_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['public_id'], str(order.public_id))
        self.assertEqual(len(response.data['items']), 2)
        self.assertEqual(response.data['status'], 'new')

    def test_order_detail_for_foreign_order_returns_not_found(self):
        foreign_order = self._create_order(self.other_user, items=[{'product': self.product_a, 'price': '1000.00', 'qty': 1}])

        response = self.client.get(f'/api/orders/{foreign_order.public_id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_repeat_order_full_success_adds_all_positions(self):
        order = self._create_order(
            self.user,
            items=[
                {'product': self.product_a, 'price': '1000.00', 'qty': 2},
                {'product': self.product_b, 'price': '2000.00', 'qty': 1},
            ],
        )

        response = self.client.post(f'/api/orders/{order.public_id}/repeat/', {'replace': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['added_positions'], 2)
        self.assertEqual(response.data['skipped_positions'], 0)
        self.assertEqual(response.data['partial_positions'], 0)

        cart = Cart.objects.get(user=self.user)
        rows = {
            item.product_id: item.quantity
            for item in CartItem.objects.filter(cart=cart)
        }
        self.assertEqual(rows, {self.product_a.id: 2, self.product_b.id: 1})

    def test_repeat_order_partial_success_with_readable_report(self):
        self.product_a.stock = 1
        self.product_a.save(update_fields=['stock'])
        self.product_b.stock = 0
        self.product_b.save(update_fields=['stock'])

        order = self._create_order(
            self.user,
            items=[
                {'product': self.product_a, 'price': '1000.00', 'qty': 3},
                {'product': self.product_b, 'price': '2000.00', 'qty': 2},
            ],
        )

        response = self.client.post(f'/api/orders/{order.public_id}/repeat/', {'replace': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['added_positions'], 1)
        self.assertEqual(response.data['partial_positions'], 1)
        self.assertEqual(response.data['skipped_positions'], 1)
        self.assertEqual(response.data['detail'], 'Заказ добавлен в корзину частично')

        partial_items = response.data['partial_items']
        self.assertEqual(len(partial_items), 1)
        self.assertEqual(partial_items[0]['requested_quantity'], 3)
        self.assertEqual(partial_items[0]['added_quantity'], 1)

        skipped_items = response.data['skipped_items']
        self.assertEqual(len(skipped_items), 1)
        self.assertIn('Нет в наличии', skipped_items[0]['reason'])

    def test_repeat_order_when_nothing_added_returns_conflict_with_reason(self):
        self.product_a.stock = 0
        self.product_a.save(update_fields=['stock'])
        self.product_b.is_active = False
        self.product_b.save(update_fields=['is_active'])

        order = self._create_order(
            self.user,
            items=[
                {'product': self.product_a, 'price': '1000.00', 'qty': 1},
                {'product': self.product_b, 'price': '2000.00', 'qty': 1},
            ],
        )

        response = self.client.post(f'/api/orders/{order.public_id}/repeat/', {'replace': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['added_positions'], 0)
        self.assertEqual(response.data['detail'], 'Невозможно повторить заказ: все товары недоступны')
        self.assertEqual(response.data['skipped_positions'], 2)

    def test_repeat_order_handles_deleted_product(self):
        order = self._create_order(
            self.user,
            items=[{'product': self.product_a, 'price': '1000.00', 'qty': 2}],
        )
        self.product_a.delete()

        response = self.client.post(f'/api/orders/{order.public_id}/repeat/', {'replace': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['added_positions'], 0)
        self.assertEqual(response.data['skipped_positions'], 1)
        self.assertIn('Товар удален из каталога', response.data['skipped_items'][0]['reason'])

    def test_repeat_order_uses_current_stock_and_current_price(self):
        order = self._create_order(
            self.user,
            items=[{'product': self.product_a, 'price': '500.00', 'qty': 3}],
        )

        self.product_a.price = Decimal('1700.00')
        self.product_a.stock = 1
        self.product_a.save(update_fields=['price', 'stock'])

        response = self.client.post(f'/api/orders/{order.public_id}/repeat/', {'replace': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['partial_positions'], 1)

        cart_item = CartItem.objects.get(cart__user=self.user, product=self.product_a)
        self.assertEqual(cart_item.quantity, 1)

        cart_payload_items = response.data['cart']['items']
        self.assertEqual(len(cart_payload_items), 1)
        self.assertEqual(Decimal(str(cart_payload_items[0]['price'])), Decimal('1700.00'))
