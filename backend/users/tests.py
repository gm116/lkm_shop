import re

from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import PendingRegistration, PendingEmailChange


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_VERIFICATION_CODE_TTL=600,
    EMAIL_VERIFICATION_RESEND_COOLDOWN=0,
    EMAIL_VERIFICATION_MAX_ATTEMPTS=5,
)
class AuthEmailFlowTests(APITestCase):
    def test_registration_requires_email_confirmation(self):
        payload = {
            'email': 'new-user@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        }

        request_res = self.client.post('/api/users/register/', payload, format='json')
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(email='new-user@example.com').exists())
        self.assertTrue(PendingRegistration.objects.filter(email='new-user@example.com').exists())
        self.assertEqual(len(mail.outbox), 1)

        message = mail.outbox[0].body
        match = re.search(r'Код подтверждения:\s*(\d{6})', message)
        self.assertIsNotNone(match)
        code = match.group(1)

        confirm_res = self.client.post(
            '/api/users/register/confirm/',
            {'email': 'new-user@example.com', 'code': code},
            format='json',
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email='new-user@example.com').exists())
        self.assertFalse(PendingRegistration.objects.filter(email='new-user@example.com').exists())

    def test_login_by_email_and_username(self):
        user = User.objects.create_user(
            username='tester_login',
            email='tester_login@example.com',
            password='StrongPass123!',
        )

        by_email = self.client.post(
            '/api/users/login/',
            {'username': user.email, 'password': 'StrongPass123!'},
            format='json',
        )
        self.assertEqual(by_email.status_code, status.HTTP_200_OK)

        by_username = self.client.post(
            '/api/users/login/',
            {'username': user.username, 'password': 'StrongPass123!'},
            format='json',
        )
        self.assertEqual(by_username.status_code, status.HTTP_200_OK)

    def test_profile_email_change_requires_code(self):
        user = User.objects.create_user(
            username='profile_user',
            email='profile_user@example.com',
            password='StrongPass123!',
        )
        self.client.force_authenticate(user=user)

        direct_patch = self.client.patch(
            '/api/users/me/',
            {'email': 'new_profile_email@example.com'},
            format='json',
        )
        self.assertEqual(direct_patch.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertEqual(user.email, 'profile_user@example.com')

    def test_profile_email_change_with_code(self):
        user = User.objects.create_user(
            username='profile_user2',
            email='profile_user2@example.com',
            password='StrongPass123!',
        )
        self.client.force_authenticate(user=user)

        request_res = self.client.post(
            '/api/users/email-change/request/',
            {'new_email': 'profile_user2_new@example.com'},
            format='json',
        )
        self.assertEqual(request_res.status_code, status.HTTP_200_OK)
        self.assertTrue(PendingEmailChange.objects.filter(user=user).exists())
        self.assertEqual(len(mail.outbox), 1)

        message = mail.outbox[0].body
        match = re.search(r'Код подтверждения:\s*(\d{6})', message)
        self.assertIsNotNone(match)
        code = match.group(1)

        confirm_res = self.client.post(
            '/api/users/email-change/confirm/',
            {'code': code},
            format='json',
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertEqual(user.email, 'profile_user2_new@example.com')
        self.assertFalse(PendingEmailChange.objects.filter(user=user).exists())
