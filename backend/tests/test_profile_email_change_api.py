import re
from datetime import timedelta

from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import PendingEmailChange


def _extract_code(body):
    match = re.search(r'Код подтверждения:\s*(\d{6})', body or '')
    return match.group(1) if match else None


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_VERIFICATION_CODE_TTL=600,
    EMAIL_VERIFICATION_RESEND_COOLDOWN=0,
    EMAIL_VERIFICATION_MAX_ATTEMPTS=5,
)
class ProfileAndEmailChangeApiTests(APITestCase):
    def setUp(self):
        mail.outbox = []
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='profile_user',
            email='profile_user@example.com',
            password=self.password,
            first_name='Иван',
            last_name='Петров',
        )
        self.client.force_authenticate(user=self.user)

    def test_get_profile_returns_200(self):
        response = self.client.get('/api/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('email'), self.user.email)
        self.assertEqual(response.data.get('username'), self.user.username)

    def test_profile_patch_updates_name_and_blocks_direct_email_change(self):
        update_names = self.client.patch(
            '/api/users/me/',
            {'first_name': 'Алексей', 'last_name': 'Сидоров'},
            format='json',
        )
        self.assertEqual(update_names.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Алексей')
        self.assertEqual(self.user.last_name, 'Сидоров')

        direct_email_change = self.client.patch(
            '/api/users/me/',
            {'email': 'new-mail@example.com'},
            format='json',
        )
        self.assertEqual(direct_email_change.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(direct_email_change.data.get('detail'), 'Смена email выполняется через подтверждение кода')

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'profile_user@example.com')

    def test_phone_mask_validation_is_consistent_on_server(self):
        invalid_phone = self.client.post(
            '/api/users/addresses/',
            {
                'label': 'Дом',
                'city': 'Казань',
                'address_line': 'ул. Пушкина, 1',
                'recipient_name': 'Иван',
                'phone': '+7 (999) 12',
            },
            format='json',
        )
        self.assertEqual(invalid_phone.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone', invalid_phone.data)

        valid_phone = self.client.post(
            '/api/users/addresses/',
            {
                'label': 'Дом',
                'city': 'Казань',
                'address_line': 'ул. Пушкина, 1',
                'recipient_name': 'Иван',
                'phone': '+7 (999) 111-22-33',
            },
            format='json',
        )
        self.assertEqual(valid_phone.status_code, status.HTTP_201_CREATED)

    def test_email_change_request_starts_flow_without_changing_email(self):
        response = self.client.post(
            '/api/users/email-change/request/',
            {'new_email': 'new-address@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PendingEmailChange.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'profile_user@example.com')
        self.assertEqual(len(mail.outbox), 1)

    def test_confirm_email_change_with_valid_code_updates_email(self):
        request_res = self.client.post(
            '/api/users/email-change/request/',
            {'new_email': 'confirmed@example.com'},
            format='json',
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        code = _extract_code(mail.outbox[-1].body)

        confirm_res = self.client.post(
            '/api/users/email-change/confirm/',
            {'code': code},
            format='json',
        )

        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'confirmed@example.com')
        self.assertFalse(PendingEmailChange.objects.filter(user=self.user).exists())

    def test_confirm_email_change_wrong_and_expired_code_returns_error(self):
        request_res = self.client.post(
            '/api/users/email-change/request/',
            {'new_email': 'wrong-code@example.com'},
            format='json',
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)

        wrong = self.client.post('/api/users/email-change/confirm/', {'code': '000000'}, format='json')
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Неверный код', wrong.data.get('detail', ''))

        pending = PendingEmailChange.objects.get(user=self.user)
        pending.code_expires_at = timezone.now() - timedelta(seconds=1)
        pending.save(update_fields=['code_expires_at'])

        expired = self.client.post('/api/users/email-change/confirm/', {'code': '000000'}, format='json')
        self.assertEqual(expired.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(expired.data.get('detail'), 'Код истек. Запросите новый')

    def test_email_change_to_existing_email_returns_predictable_error(self):
        User.objects.create_user(
            username='taken_user',
            email='taken@example.com',
            password='StrongPass123!',
        )

        response = self.client.post(
            '/api/users/email-change/request/',
            {'new_email': 'taken@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Этот email уже занят')


class LastLoginUpdateTests(APITestCase):
    def test_last_login_is_updated_on_successful_login(self):
        user = User.objects.create_user(
            username='login_time_user',
            email='login_time_user@example.com',
            password='StrongPass123!',
        )
        self.assertIsNone(user.last_login)

        response = self.client.post(
            '/api/users/login/',
            {'username': user.email, 'password': 'StrongPass123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)
