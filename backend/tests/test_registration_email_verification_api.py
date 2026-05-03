import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import PendingRegistration
from users.registration_api import _build_username_from_email


def _extract_code_from_outbox(message_index=0):
    body = mail.outbox[message_index].body
    match = re.search(r'Код подтверждения:\s*(\d{6})', body)
    return match.group(1) if match else None


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_VERIFICATION_CODE_TTL=600,
    EMAIL_VERIFICATION_RESEND_COOLDOWN=60,
    EMAIL_VERIFICATION_MAX_ATTEMPTS=5,
    EMAIL_VERIFICATION_PENDING_RETENTION=86400,
)
class RegistrationEmailVerificationApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []

    def _request_code(self, email='new-user@example.com', password='StrongPass123!'):
        return self.client.post(
            '/api/users/register/',
            {
                'email': email,
                'password': password,
                'password_confirm': password,
            },
            format='json',
        )

    def _confirm_code(self, email, code):
        return self.client.post(
            '/api/users/register/confirm/',
            {'email': email, 'code': code},
            format='json',
        )

    def test_request_code_new_email_success(self):
        response = self._request_code()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Код подтверждения отправлен', response.data.get('detail', ''))
        self.assertTrue(PendingRegistration.objects.filter(email='new-user@example.com').exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIsNotNone(_extract_code_from_outbox())

    def test_repeat_request_before_cooldown_returns_429(self):
        first = self._request_code(email='cooldown@example.com')
        second = self._request_code(email='cooldown@example.com')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('retry_after', second.data)
        self.assertGreaterEqual(int(second.data['retry_after']), 1)

    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN=0)
    def test_repeat_request_after_cooldown_updates_pending_record(self):
        first = self._request_code(email='resend@example.com')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        pending_before = PendingRegistration.objects.get(email='resend@example.com')
        first_updated_at = pending_before.updated_at

        second = self._request_code(email='resend@example.com')
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        pending_after = PendingRegistration.objects.get(email='resend@example.com')
        self.assertGreaterEqual(pending_after.updated_at, first_updated_at)
        self.assertEqual(len(mail.outbox), 2)

    def test_request_code_for_existing_email_returns_validation_error(self):
        User.objects.create_user(username='existing', email='existing@example.com', password='StrongPass123!')

        response = self._request_code(email='existing@example.com')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertIn('Этот email уже занят', str(response.data.get('email')))
        self.assertFalse(PendingRegistration.objects.filter(email='existing@example.com').exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_registration_with_valid_code_creates_user(self):
        self._request_code(email='confirm@example.com')
        code = _extract_code_from_outbox()

        response = self._confirm_code('confirm@example.com', code)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email='confirm@example.com').exists())
        self.assertFalse(PendingRegistration.objects.filter(email='confirm@example.com').exists())

    def test_confirm_registration_with_wrong_code_returns_error(self):
        self._request_code(email='wrong-code@example.com')

        response = self._confirm_code('wrong-code@example.com', '000000')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Неверный код', response.data.get('detail', ''))

    def test_confirm_registration_with_expired_code_returns_error(self):
        self._request_code(email='expired@example.com')
        code = _extract_code_from_outbox()

        pending = PendingRegistration.objects.get(email='expired@example.com')
        pending.code_expires_at = timezone.now() - timedelta(seconds=1)
        pending.save(update_fields=['code_expires_at'])

        response = self._confirm_code('expired@example.com', code)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Код истек. Запросите новый')

    def test_confirm_registration_reuse_code_after_success_returns_error(self):
        self._request_code(email='reuse@example.com')
        code = _extract_code_from_outbox()

        first = self._confirm_code('reuse@example.com', code)
        second = self._confirm_code('reuse@example.com', code)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.data.get('detail'), 'Сначала запросите код подтверждения')

    def test_generated_username_is_unique_and_valid_format(self):
        User.objects.create_user(username='john', email='john-old@example.com', password='StrongPass123!')

        self._request_code(email='john@example.com')
        code = _extract_code_from_outbox()
        response = self._confirm_code('john@example.com', code)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email='john@example.com')
        self.assertNotEqual(user.username, 'john')
        self.assertTrue(user.username.startswith('john'))
        self.assertLessEqual(len(user.username), 150)
        self.assertRegex(user.username, r'^[a-z0-9._-]+$')

    def test_build_username_enforces_length_limit(self):
        candidate = _build_username_from_email(f"{'x' * 400}@example.com")
        self.assertLessEqual(len(candidate), 150)

    def test_password_validation_similarity_common_and_min_length(self):
        too_short = self.client.post(
            '/api/users/register/',
            {
                'email': 'short@example.com',
                'password': 'Short1!',
                'password_confirm': 'Short1!',
            },
            format='json',
        )
        self.assertEqual(too_short.status_code, status.HTTP_400_BAD_REQUEST)

        too_similar = self.client.post(
            '/api/users/register/',
            {
                'email': 'similarpass@example.com',
                'password': 'similarpass123',
                'password_confirm': 'similarpass123',
            },
            format='json',
        )
        self.assertEqual(too_similar.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', too_similar.data)

        numeric = self.client.post(
            '/api/users/register/',
            {
                'email': 'numeric@example.com',
                'password': '1234567890',
                'password_confirm': '1234567890',
            },
            format='json',
        )
        self.assertEqual(numeric.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', numeric.data)

    def test_email_is_required_and_must_be_valid(self):
        missing_email = self.client.post(
            '/api/users/register/',
            {
                'password': 'StrongPass123!',
                'password_confirm': 'StrongPass123!',
            },
            format='json',
        )
        self.assertEqual(missing_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', missing_email.data)

        invalid_email = self.client.post(
            '/api/users/register/',
            {
                'email': 'not-an-email',
                'password': 'StrongPass123!',
                'password_confirm': 'StrongPass123!',
            },
            format='json',
        )
        self.assertEqual(invalid_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', invalid_email.data)

    def test_extra_fields_in_payload_are_ignored_predictably(self):
        response = self.client.post(
            '/api/users/register/',
            {
                'email': 'extra@example.com',
                'password': 'StrongPass123!',
                'password_confirm': 'StrongPass123!',
                'is_staff': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PendingRegistration.objects.filter(email='extra@example.com').exists())
        self.assertFalse(User.objects.filter(email='extra@example.com').exists())

    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN=0)
    def test_registration_throttle_is_applied(self):
        responses = [
            self._request_code(email='throttle1@example.com'),
            self._request_code(email='throttle2@example.com'),
            self._request_code(email='throttle3@example.com'),
            self._request_code(email='throttle4@example.com'),
        ]

        self.assertEqual(responses[0].status_code, status.HTTP_200_OK)
        self.assertEqual(responses[1].status_code, status.HTTP_200_OK)
        self.assertEqual(responses[2].status_code, status.HTTP_200_OK)
        self.assertEqual(responses[3].status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch('users.registration_api._send_registration_code', side_effect=RuntimeError('smtp timeout'))
    def test_smtp_failure_returns_controlled_500_and_does_not_crash(self, _mock_send):
        response = self._request_code(email='smtp-fail@example.com')

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data.get('detail'), 'Не удалось отправить код. Попробуйте позже')
        self.assertFalse(PendingRegistration.objects.filter(email='smtp-fail@example.com').exists())

    @patch('users.registration_api._make_verification_code', return_value='654321')
    @patch('users.registration_api._send_registration_code', side_effect=RuntimeError('smtp down'))
    def test_error_logs_do_not_contain_verification_code_or_password(self, _mock_send, _mock_code):
        password = 'StrongPass123!'
        with self.assertLogs('users.registration_api', level='ERROR') as captured:
            response = self._request_code(email='log-check@example.com', password=password)

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        output = '\n'.join(captured.output)
        self.assertNotIn('654321', output)
        self.assertNotIn(password, output)
