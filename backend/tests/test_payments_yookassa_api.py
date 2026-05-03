import ipaddress
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Category, Product
from orders.models import Order, OrderItem, OrderStatus
from payments.models import Payment, PaymentWebhookEvent


class PaymentsYooKassaApiTests(APITestCase):
    def setUp(self):
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='payments_user',
            email='payments_user@example.com',
            password=self.password,
        )
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Оплата', slug='oplata-tests', is_active=True)

    def _create_product(self, *, stock=10, price=Decimal('1000.00'), sku_suffix='1'):
        return Product.objects.create(
            category=self.category,
            name=f'Товар {sku_suffix}',
            slug=f'tovar-{sku_suffix}',
            sku=f'SKU-PAY-{sku_suffix}',
            price=price,
            stock=stock,
            is_active=True,
        )

    def _create_order(self, *, product, quantity=1, status_value=OrderStatus.NEW, total_amount=None):
        total = total_amount if total_amount is not None else product.price * quantity
        order = Order.objects.create(
            user=self.user,
            status=status_value,
            total_amount=total,
            customer_name='Петр Иванов',
            customer_phone='+7 (999) 111-22-33',
            customer_email='petr@example.com',
            delivery_type='store_pickup',
            pickup_point_data={
                'id': 'store_default',
                'name': 'Самовывоз',
                'address': 'Адрес магазина',
            },
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name_snapshot=product.name,
            price_snapshot=product.price,
            quantity=quantity,
            image_url_snapshot='https://example.com/image.jpg',
        )
        return order

    def _create_payment(self, *, order, provider_payment_id='pay_1', payment_status=Payment.Status.PENDING):
        return Payment.objects.create(
            order=order,
            amount_value=order.total_amount,
            currency='RUB',
            status=payment_status,
            provider_payment_id=provider_payment_id,
            idempotence_key='idem-1',
            confirmation_url='https://pay.example/confirm',
            raw={'status': payment_status},
        )

    def _payment_payload(self, *, provider_payment_id, payment_status, order_public_id, extra=None):
        payload = {
            'type': 'notification',
            'event': f'payment.{payment_status}',
            'object': {
                'id': provider_payment_id,
                'status': payment_status,
                'metadata': {'order_id': str(order_public_id)},
            },
        }
        if extra:
            payload['object'].update(extra)
        return payload

    def _provider_payment_data(self, *, provider_payment_id, payment_status, order, amount=None, currency='RUB'):
        return {
            'id': provider_payment_id,
            'status': payment_status,
            'amount': {
                'value': str(amount if amount is not None else order.total_amount),
                'currency': currency,
            },
            'metadata': {
                'order_id': str(order.public_id),
            },
        }

    @override_settings(YOOKASSA_RETURN_URL='http://localhost:3000/checkout/success')
    @patch('payments.views.create_payment_for_order')
    def test_create_payment_for_new_order_success(self, create_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1200.00'), sku_suffix='create-ok')
        order = self._create_order(product=product, quantity=2)

        create_payment_mock.return_value = {
            'idempotence_key': 'idem-created',
            'provider_payment_id': 'yk_created_1',
            'status': Payment.Status.PENDING,
            'confirmation_url': 'https://pay.example/redirect',
            'raw': {'id': 'yk_created_1', 'status': 'pending'},
        }

        response = self.client.post(
            '/api/payments/create/',
            {'order_id': str(order.public_id)},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], Payment.Status.PENDING)
        self.assertEqual(response.data['payment_id'], 'yk_created_1')

        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.provider_payment_id, 'yk_created_1')
        self.assertEqual(payment.status, Payment.Status.PENDING)

    @override_settings(YOOKASSA_RETURN_URL='http://localhost:3000/checkout/success')
    def test_create_payment_rejected_for_paid_or_canceled_order(self):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='create-reject')
        paid_order = self._create_order(product=product, quantity=1, status_value=OrderStatus.PAID)
        canceled_order = self._create_order(product=product, quantity=1, status_value=OrderStatus.CANCELED)

        paid_response = self.client.post(
            '/api/payments/create/',
            {'order_id': str(paid_order.public_id)},
            format='json',
        )
        canceled_response = self.client.post(
            '/api/payments/create/',
            {'order_id': str(canceled_order.public_id)},
            format='json',
        )

        self.assertEqual(paid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(canceled_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(paid_response.data.get('detail'), 'Заказ уже оплачен')
        self.assertEqual(canceled_response.data.get('detail'), 'Заказ отменен')

    @override_settings(YOOKASSA_RETURN_URL='http://localhost:3000/checkout/success')
    @patch('payments.views.create_payment_for_order', side_effect=RuntimeError('YOOKASSA credentials are not set'))
    def test_create_payment_credentials_error_is_returned(self, _create_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='credentials')
        order = self._create_order(product=product, quantity=1)

        response = self.client.post(
            '/api/payments/create/',
            {'order_id': str(order.public_id)},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'YOOKASSA credentials are not set')

    @override_settings(YOOKASSA_RETURN_URL='http://localhost:3000/checkout/success')
    @patch('payments.views.create_payment_for_order', side_effect=RuntimeError('provider temporary failure'))
    def test_create_payment_failure_rolls_back_order_consistently(self, _create_payment_mock):
        product = self._create_product(stock=0, price=Decimal('1000.00'), sku_suffix='rollback')
        order = self._create_order(product=product, quantity=3)

        response = self.client.post(
            '/api/payments/create/',
            {'order_id': str(order.public_id)},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        order.refresh_from_db()
        product.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.CANCELED)
        self.assertEqual(product.stock, 3)
        self.assertFalse(Payment.objects.filter(order=order).exists())

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.send_order_paid_email', return_value=(True, None))
    @patch('payments.views.fetch_payment')
    def test_webhook_valid_ip_and_payload_updates_order(self, fetch_payment_mock, _send_paid_email_mock):
        product = self._create_product(stock=5, price=Decimal('1500.00'), sku_suffix='webhook-ok')
        order = self._create_order(product=product, quantity=2)
        payment = self._create_payment(order=order, provider_payment_id='yk_ok_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
        )
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
        )

        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('ok'), True)
        fetch_payment_mock.assert_called_once_with(payment.provider_payment_id)

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(order.status, OrderStatus.PAID)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('10.0.0.0/24'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    def test_webhook_rejects_ip_outside_allowlist(self):
        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            {'type': 'notification'},
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('detail'), 'IP не разрешен')

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('203.0.113.0/24'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
        YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR=False,
    )
    def test_webhook_ignores_x_forwarded_for_when_flag_disabled(self):
        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            {'type': 'notification'},
            format='json',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='203.0.113.15',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('203.0.113.0/24'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
        YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR=True,
    )
    @patch('payments.views.fetch_payment')
    def test_webhook_uses_x_forwarded_for_when_flag_enabled(self, fetch_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='xff-enabled')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_xff_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.PENDING,
            order_public_id=order.public_id,
        )
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.PENDING,
            order=order,
        )

        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='203.0.113.15',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.fetch_payment')
    def test_webhook_replay_is_idempotent(self, fetch_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='replay')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_replay_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.PENDING,
            order_public_id=order.public_id,
        )
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.PENDING,
            order=order,
        )

        first = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )
        second = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(PaymentWebhookEvent.objects.count(), 1)
        self.assertEqual(fetch_payment_mock.call_count, 1)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    def test_webhook_rejects_unknown_status(self):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='unknown-status')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_unknown_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status='refunded',
            order_public_id=order.public_id,
        )

        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.fetch_payment')
    def test_webhook_rejects_amount_currency_or_metadata_mismatch(self, fetch_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1300.00'), sku_suffix='mismatch')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_mismatch_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
        )

        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
            amount=Decimal('9999.00'),
        )
        amount_response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )
        self.assertEqual(amount_response.status_code, status.HTTP_400_BAD_REQUEST)

        PaymentWebhookEvent.objects.all().delete()
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
            currency='USD',
        )
        currency_response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )
        self.assertEqual(currency_response.status_code, status.HTTP_400_BAD_REQUEST)

        PaymentWebhookEvent.objects.all().delete()
        provider_data = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
        )
        provider_data['metadata']['order_id'] = 'wrong-order-id'
        fetch_payment_mock.return_value = provider_data
        metadata_response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )
        self.assertEqual(metadata_response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.send_order_paid_email', return_value=(True, None))
    @patch('payments.views.fetch_payment')
    def test_payment_succeeded_marks_order_paid_once(self, fetch_payment_mock, send_paid_email_mock):
        product = self._create_product(stock=5, price=Decimal('1700.00'), sku_suffix='paid-once')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_paid_once_1')

        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
        )

        payload1 = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
        )
        payload2 = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
            extra={'description': 'another payload hash'},
        )

        first = self.client.post('/api/payments/webhook/yookassa/', payload1, format='json', REMOTE_ADDR='127.0.0.1')
        second = self.client.post('/api/payments/webhook/yookassa/', payload2, format='json', REMOTE_ADDR='127.0.0.1')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.PAID)
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertIsNotNone(payment.paid_at)
        self.assertIsNotNone(payment.paid_email_sent_at)
        self.assertEqual(send_paid_email_mock.call_count, 1)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.fetch_payment')
    def test_payment_canceled_cancels_order_and_restores_stock(self, fetch_payment_mock):
        product = self._create_product(stock=0, price=Decimal('2000.00'), sku_suffix='cancel-stock')
        order = self._create_order(product=product, quantity=2)
        payment = self._create_payment(order=order, provider_payment_id='yk_cancel_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.CANCELED,
            order_public_id=order.public_id,
        )
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.CANCELED,
            order=order,
        )

        response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        product.refresh_from_db()
        payment.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.CANCELED)
        self.assertEqual(product.stock, 2)
        self.assertEqual(payment.status, Payment.Status.CANCELED)

    @patch('payments.views.fetch_payment')
    @patch('payments.views.send_order_paid_email', return_value=(True, None))
    def test_manual_sync_updates_payment_and_order_status(self, _send_paid_email_mock, fetch_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1500.00'), sku_suffix='sync-ok')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_sync_1')

        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
        )

        response = self.client.post(f'/api/payments/sync/{order.public_id}/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), Payment.Status.SUCCEEDED)

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(order.status, OrderStatus.PAID)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
    )
    @patch('payments.views.fetch_payment', side_effect=RuntimeError('provider timeout'))
    def test_yookassa_api_errors_do_not_crash_webhook_or_sync(self, _fetch_payment_mock):
        product = self._create_product(stock=5, price=Decimal('1700.00'), sku_suffix='api-fail')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_api_fail_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
        )

        webhook_response = self.client.post(
            '/api/payments/webhook/yookassa/',
            payload,
            format='json',
            REMOTE_ADDR='127.0.0.1',
        )
        sync_response = self.client.post(f'/api/payments/sync/{order.public_id}/', {}, format='json')

        self.assertEqual(webhook_response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(sync_response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(
        YOOKASSA_WEBHOOK_ALLOWED_IPS=(ipaddress.ip_network('127.0.0.1/32'),),
        YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST=True,
        YOOKASSA_SECRET_KEY='super-secret-key-value',
    )
    @patch('payments.views.send_order_paid_email', return_value=(True, None))
    @patch('payments.views.fetch_payment')
    def test_webhook_logs_do_not_expose_secrets(self, fetch_payment_mock, _send_paid_email_mock):
        product = self._create_product(stock=5, price=Decimal('1800.00'), sku_suffix='logs')
        order = self._create_order(product=product, quantity=1)
        payment = self._create_payment(order=order, provider_payment_id='yk_logs_1')

        payload = self._payment_payload(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order_public_id=order.public_id,
            extra={'private': 'do-not-log-this'},
        )
        fetch_payment_mock.return_value = self._provider_payment_data(
            provider_payment_id=payment.provider_payment_id,
            payment_status=Payment.Status.SUCCEEDED,
            order=order,
        )

        with self.assertLogs('payments.views', level='INFO') as logs:
            response = self.client.post(
                '/api/payments/webhook/yookassa/',
                payload,
                format='json',
                REMOTE_ADDR='127.0.0.1',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        joined = '\n'.join(logs.output)
        self.assertNotIn('super-secret-key-value', joined)
        self.assertNotIn('do-not-log-this', joined)
