from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken


class AuthSessionsApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='tester',
            email='tester@example.com',
            password=self.password,
            is_active=True,
        )

    def _login(self, identifier=None, password=None):
        return self.client.post(
            '/api/users/login/',
            {
                'username': identifier or self.user.email,
                'password': password or self.password,
            },
            format='json',
        )

    def _set_refresh_cookie(self, client: APIClient, token: str):
        client.cookies['refresh_token'] = token

    def test_login_with_email_success(self):
        response = self._login(identifier=self.user.email)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['email'], self.user.email)
        self.assertEqual(response.data['user']['username'], self.user.username)
        self.assertIn('refresh_token', response.cookies)

    def test_login_with_username_success(self):
        response = self._login(identifier=self.user.username)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['email'], self.user.email)

    def test_login_wrong_password_and_unknown_user_have_same_message(self):
        wrong_password_response = self._login(password='WrongPass123!')
        unknown_user_response = self._login(identifier='unknown@example.com')

        self.assertEqual(wrong_password_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unknown_user_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wrong_password_response.data.get('detail'), 'Неверный логин или пароль')
        self.assertEqual(unknown_user_response.data.get('detail'), 'Неверный логин или пароль')

    def test_login_blocked_user_is_forbidden(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        response = self._login(identifier=self.user.email)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('detail'), 'Аккаунт деактивирован')

    def test_refresh_returns_new_access_token(self):
        login_response = self._login()
        refresh_token = login_response.cookies['refresh_token'].value

        refresh_client = APIClient()
        self._set_refresh_cookie(refresh_client, refresh_token)
        refresh_response = refresh_client.post('/api/users/refresh/', {}, format='json')

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh_response.data)
        self.assertTrue(refresh_response.data['access'])

    def test_refresh_with_invalid_token_returns_401(self):
        refresh_client = APIClient()
        self._set_refresh_cookie(refresh_client, 'not-a-valid-jwt')

        response = refresh_client.post('/api/users/refresh/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get('detail'), 'Недействительный токен обновления')

    def test_refresh_with_blacklisted_token_returns_401(self):
        refresh_token = RefreshToken.for_user(self.user)
        refresh_token.blacklist()

        refresh_client = APIClient()
        self._set_refresh_cookie(refresh_client, str(refresh_token))
        response = refresh_client.post('/api/users/refresh/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get('detail'), 'Недействительный токен обновления')

    def test_logout_revokes_refresh_token(self):
        login_response = self._login()
        refresh_token = login_response.cookies['refresh_token'].value
        token_jti = RefreshToken(refresh_token)['jti']

        logout_client = APIClient()
        self._set_refresh_cookie(logout_client, refresh_token)

        logout_response = logout_client.post('/api/users/logout/', {}, format='json')
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        outstanding = OutstandingToken.objects.get(jti=token_jti)
        self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

        refresh_client = APIClient()
        self._set_refresh_cookie(refresh_client, refresh_token)
        refresh_response = refresh_client.post('/api/users/refresh/', {}, format='json')
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_second_logout_with_same_token_is_safe(self):
        login_response = self._login()
        refresh_token = login_response.cookies['refresh_token'].value

        logout_client = APIClient()
        self._set_refresh_cookie(logout_client, refresh_token)

        first_logout = logout_client.post('/api/users/logout/', {}, format='json')
        self.assertEqual(first_logout.status_code, status.HTTP_200_OK)

        self._set_refresh_cookie(logout_client, refresh_token)
        second_logout = logout_client.post('/api/users/logout/', {}, format='json')
        self.assertEqual(second_logout.status_code, status.HTTP_200_OK)

    def test_protected_endpoint_without_access_returns_401(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_with_expired_access_returns_401(self):
        refresh = RefreshToken.for_user(self.user)
        expired_access = refresh.access_token
        expired_access.set_exp(from_time=timezone.now(), lifetime=timedelta(seconds=-1))

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(expired_access)}')

        response = client.get('/api/users/me/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(
    REFRESH_COOKIE_SECURE=True,
    REFRESH_COOKIE_SAMESITE='Strict',
    REFRESH_COOKIE_PATH='/',
)
class RefreshCookieFlagsTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='cookie_tester',
            email='cookie_tester@example.com',
            password='StrongPass123!',
        )

    def test_refresh_cookie_has_required_flags(self):
        response = self.client.post(
            '/api/users/login/',
            {'username': self.user.email, 'password': 'StrongPass123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('refresh_token', response.cookies)

        refresh_cookie = response.cookies['refresh_token']
        self.assertEqual(refresh_cookie['httponly'], True)
        self.assertEqual(refresh_cookie['secure'], True)
        self.assertEqual(refresh_cookie['samesite'], 'Strict')
        self.assertEqual(refresh_cookie['path'], '/')
