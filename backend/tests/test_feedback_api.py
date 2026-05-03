from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='store@example.com',
    FEEDBACK_TO_EMAIL='support@example.com',
    REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'rest_framework_simplejwt.authentication.JWTAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': [],
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.ScopedRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': {
            'feedback_send': '2/min',
        },
    },
)
class FeedbackApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []

    def _payload(self, **overrides):
        data = {
            'name': 'Иван',
            'email': 'client@example.com',
            'phone': '+7 (900) 111-22-33',
            'subject': 'Нужна консультация',
            'message': 'Подскажите, какой лак выбрать для кузова.',
        }
        data.update(overrides)
        return data

    def test_send_feedback_success_and_email_headers(self):
        response = self.client.post('/api/users/feedback/', self._payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('detail'), 'Обращение отправлено')
        self.assertEqual(len(mail.outbox), 1)

        sent = mail.outbox[0]
        self.assertEqual(sent.to, ['support@example.com'])
        self.assertEqual(sent.from_email, 'store@example.com')
        self.assertEqual(sent.reply_to, ['client@example.com'])
        self.assertIn('Нужна консультация', sent.subject)

    def test_send_feedback_validates_required_fields(self):
        response = self.client.post(
            '/api/users/feedback/',
            self._payload(email='', subject='   ', message='   '),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertIn('subject', response.data)
        self.assertIn('message', response.data)

    def test_send_feedback_message_min_length(self):
        response = self.client.post(
            '/api/users/feedback/',
            self._payload(message='коротко'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('message', response.data)

    def test_phone_is_optional(self):
        response = self.client.post(
            '/api/users/feedback/',
            self._payload(phone=''),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

    @patch('users.feedback_api.EmailMessage.send', side_effect=RuntimeError('smtp timeout'))
    def test_smtp_failure_returns_readable_error(self, _mock_send):
        response = self.client.post('/api/users/feedback/', self._payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('detail'), 'Не удалось отправить обращение. Попробуйте позже')

    def test_feedback_throttle_is_applied(self):
        r1 = self.client.post('/api/users/feedback/', self._payload(email='a1@example.com'), format='json')
        r2 = self.client.post('/api/users/feedback/', self._payload(email='a2@example.com'), format='json')
        r3 = self.client.post('/api/users/feedback/', self._payload(email='a3@example.com'), format='json')
        r4 = self.client.post('/api/users/feedback/', self._payload(email='a4@example.com'), format='json')

        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r3.status_code, status.HTTP_200_OK)
        self.assertEqual(r4.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(
    FEEDBACK_TO_EMAIL='',
    REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'rest_framework_simplejwt.authentication.JWTAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': [],
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.ScopedRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': {
            'feedback_send': '20/min',
        },
    },
)
class FeedbackUnavailableTests(APITestCase):
    def test_feedback_disabled_when_recipient_missing(self):
        response = self.client.post(
            '/api/users/feedback/',
            {
                'email': 'client@example.com',
                'subject': 'Тема обращения',
                'message': 'Текст сообщения длиннее десяти символов.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data.get('detail'), 'Обратная связь временно недоступна')
