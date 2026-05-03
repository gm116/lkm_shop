from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import Address


class UserAddressesApiTests(APITestCase):
    def setUp(self):
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='addr_owner',
            email='addr_owner@example.com',
            password=self.password,
        )
        self.other_user = User.objects.create_user(
            username='addr_other',
            email='addr_other@example.com',
            password=self.password,
        )
        self.client.force_authenticate(user=self.user)

    def _create_address(self, user, **overrides):
        payload = {
            'label': 'Дом',
            'city': 'Казань',
            'address_line': 'ул. Пушкина, 1',
            'recipient_name': 'Иван Петров',
            'phone': '+7 (999) 111-22-33',
            'comment': 'Позвонить за 15 минут',
            'is_default': False,
        }
        payload.update(overrides)
        return Address.objects.create(user=user, **payload)

    def test_list_addresses_returns_only_owner_addresses(self):
        own_a = self._create_address(self.user, label='Дом')
        own_b = self._create_address(self.user, label='Офис')
        self._create_address(self.other_user, label='Чужой')

        response = self.client.get('/api/users/addresses/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row['id'] for row in response.data]
        self.assertCountEqual(ids, [own_a.id, own_b.id])
        for row in response.data:
            self.assertNotEqual(row['label'], 'Чужой')

    def test_create_address_with_valid_payload_returns_201(self):
        response = self.client.post(
            '/api/users/addresses/',
            {
                'label': 'Склад',
                'city': 'Набережные Челны',
                'address_line': 'пр-т Мира, 12',
                'recipient_name': 'Петр',
                'phone': '+7 (900) 123-45-67',
                'comment': 'Вход со двора',
                'is_default': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Address.objects.get(id=response.data['id'])
        self.assertEqual(created.user_id, self.user.id)
        self.assertTrue(created.is_default)
        self.assertEqual(created.city, 'Набережные Челны')

    def test_create_address_with_invalid_payload_returns_validation_errors(self):
        response = self.client.post(
            '/api/users/addresses/',
            {
                'label': 'Дом',
                'city': ' ',
                'address_line': '',
                'phone': '+7 (900) 12',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('city', response.data)

        response2 = self.client.post(
            '/api/users/addresses/',
            {
                'label': 'Дом',
                'city': 'Казань',
                'address_line': 'ул. Пушкина, 1',
                'phone': '+7 (900) 12',
            },
            format='json',
        )
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone', response2.data)

    def test_update_own_address(self):
        addr = self._create_address(self.user)

        response = self.client.patch(
            f'/api/users/addresses/{addr.id}/',
            {
                'city': 'Москва',
                'address_line': 'ул. Ленина, 8',
                'is_default': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        addr.refresh_from_db()
        self.assertEqual(addr.city, 'Москва')
        self.assertEqual(addr.address_line, 'ул. Ленина, 8')
        self.assertTrue(addr.is_default)

    def test_update_foreign_address_returns_not_found(self):
        foreign = self._create_address(self.other_user)

        response = self.client.patch(
            f'/api/users/addresses/{foreign.id}/',
            {'city': 'Уфа'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_address_returns_204(self):
        addr = self._create_address(self.user)

        response = self.client.delete(f'/api/users/addresses/{addr.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Address.objects.filter(id=addr.id).exists())

    def test_delete_foreign_address_returns_not_found(self):
        foreign = self._create_address(self.other_user)

        response = self.client.delete(f'/api/users/addresses/{foreign.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_set_default_resets_flag_on_other_addresses(self):
        first = self._create_address(self.user, label='Первый', is_default=True)
        second = self._create_address(self.user, label='Второй', is_default=False)

        response = self.client.post(f'/api/users/addresses/{second.id}/set-default/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(second.is_default)

    def test_delete_default_address_is_handled_correctly(self):
        default_addr = self._create_address(self.user, label='Основной', is_default=True)
        other_addr = self._create_address(self.user, label='Резерв', is_default=False)

        response = self.client.delete(f'/api/users/addresses/{default_addr.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Address.objects.filter(id=default_addr.id).exists())
        remaining = list(Address.objects.filter(user=self.user).values_list('id', 'is_default'))
        self.assertEqual(remaining, [(other_addr.id, False)])
