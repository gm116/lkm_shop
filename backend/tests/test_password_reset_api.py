from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken


class PasswordResetApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='reset_tester',
            email='reset_tester@example.com',
            password=self.password,
        )

    def _request_reset(self, email):
        return self.client.post('/api/users/password-reset/request/', {'email': email}, format='json')

    def _validate_link(self, uid, token):
        return self.client.post('/api/users/password-reset/validate/', {'uid': uid, 'token': token}, format='json')

    def _confirm_reset(self, uid, token, new_password, new_password_confirm=None):
        return self.client.post(
            '/api/users/password-reset/confirm/',
            {
                'uid': uid,
                'token': token,
                'new_password': new_password,
                'new_password_confirm': new_password_confirm or new_password,
            },
            format='json',
        )

    def _uid_token_for(self, user):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        return uid, token

    def test_request_reset_existing_email_success(self):
        response = self._request_reset(self.user.email)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data.get('detail'),
            'Если такой email зарегистрирован, мы отправили ссылку для восстановления',
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/reset-password/', mail.outbox[0].body)

    def test_request_reset_nonexistent_email_same_external_response(self):
        existing_response = self._request_reset(self.user.email)
        nonexistent_response = self._request_reset('missing-user@example.com')

        self.assertEqual(existing_response.status_code, status.HTTP_200_OK)
        self.assertEqual(nonexistent_response.status_code, status.HTTP_200_OK)
        self.assertEqual(existing_response.data, nonexistent_response.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_validate_reset_link_valid_returns_200(self):
        uid, token = self._uid_token_for(self.user)

        response = self._validate_link(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('valid'), True)

    def test_validate_reset_link_invalid_returns_400(self):
        response = self._validate_link('invalid_uid', 'invalid_token')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('недействительна', response.data.get('detail', '').lower())

    def test_validate_reset_link_expired_returns_400(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        issued_at = datetime(2026, 1, 1, 12, 0, 0)

        with patch.object(default_token_generator, '_now', return_value=issued_at):
            token = default_token_generator.make_token(self.user)

        with patch.object(default_token_generator, '_now', return_value=issued_at + timedelta(hours=2)):
            response = self._validate_link(uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('недействительна', response.data.get('detail', '').lower())

    def test_confirm_reset_valid_link_success(self):
        uid, token = self._uid_token_for(self.user)

        response = self._confirm_reset(uid, token, 'NewStrongPass123!')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('detail'), 'Пароль обновлён')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewStrongPass123!'))

    def test_confirm_reset_reuse_same_link_is_forbidden(self):
        uid, token = self._uid_token_for(self.user)

        first = self._confirm_reset(uid, token, 'NewStrongPass123!')
        second = self._confirm_reset(uid, token, 'AnotherStrongPass123!')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('недействительна', second.data.get('detail', '').lower())

    def test_confirm_reset_password_validators_are_applied(self):
        uid, token = self._uid_token_for(self.user)

        too_short = self._confirm_reset(uid, token, 'short1!')
        self.assertEqual(too_short.status_code, status.HTTP_400_BAD_REQUEST)

        uid2, token2 = self._uid_token_for(self.user)
        too_common = self._confirm_reset(uid2, token2, 'password123')
        self.assertEqual(too_common.status_code, status.HTTP_400_BAD_REQUEST)

        uid3, token3 = self._uid_token_for(self.user)
        too_similar = self._confirm_reset(uid3, token3, 'reset_tester123')
        self.assertEqual(too_similar.status_code, status.HTTP_400_BAD_REQUEST)

    def test_old_password_stops_working_after_successful_reset(self):
        uid, token = self._uid_token_for(self.user)
        reset_response = self._confirm_reset(uid, token, 'NewStrongPass123!')
        self.assertEqual(reset_response.status_code, status.HTTP_200_OK)

        old_login = self.client.post(
            '/api/users/login/',
            {'username': self.user.email, 'password': self.password},
            format='json',
        )
        new_login = self.client.post(
            '/api/users/login/',
            {'username': self.user.email, 'password': 'NewStrongPass123!'},
            format='json',
        )

        self.assertEqual(old_login.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_refresh_token_policy_after_password_reset_existing_refresh_remains_valid(self):
        refresh_token = RefreshToken.for_user(self.user)

        uid, token = self._uid_token_for(self.user)
        reset_response = self._confirm_reset(uid, token, 'NewStrongPass123!')
        self.assertEqual(reset_response.status_code, status.HTTP_200_OK)

        refresh_client = APIClient()
        refresh_client.cookies['refresh_token'] = str(refresh_token)
        refresh_response = refresh_client.post('/api/users/refresh/', {}, format='json')

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh_response.data)

    @patch('users.views.send_mail', side_effect=RuntimeError('smtp broken'))
    def test_request_reset_smtp_failure_does_not_break_endpoint(self, _mock_send_mail):
        response = self._request_reset(self.user.email)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data.get('detail'),
            'Если такой email зарегистрирован, мы отправили ссылку для восстановления',
        )
        self.assertEqual(len(mail.outbox), 0)
