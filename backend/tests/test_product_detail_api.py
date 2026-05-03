from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Brand, Category, Product, ProductAttribute, ProductImage


class ProductDetailApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Лаки', slug='laki', is_active=True)
        self.brand = Brand.objects.create(name='Kansai', slug='kansai', is_active=True)

        self.product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name='Лак HS',
            slug='lak-hs',
            description='Описание товара',
            sku='HS-001',
            price=Decimal('13098.00'),
            stock=12,
            is_active=True,
        )
        ProductImage.objects.create(product=self.product, image_url='https://example.com/1.jpg', sort_order=0)
        ProductImage.objects.create(product=self.product, image_url='https://example.com/2.jpg', sort_order=1)
        ProductAttribute.objects.create(product=self.product, name='Степень блеска', value='Глянцевый', is_filterable=True)

    def test_get_product_by_id_success(self):
        response = self.client.get(f'/api/catalog/products/{self.product.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.product.id)
        self.assertEqual(response.data['slug'], 'lak-hs')
        self.assertEqual(response.data['sku'], 'HS-001')
        self.assertEqual(response.data['stock'], 12)
        self.assertEqual(len(response.data['images']), 2)

    def test_get_product_by_slug_success(self):
        response = self.client.get('/api/catalog/products/lak-hs/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.product.id)
        self.assertEqual(response.data['slug'], 'lak-hs')

    def test_get_product_not_found_returns_404(self):
        response = self.client.get('/api/catalog/products/not-exists-999/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data.get('detail'), 'Товар не найден')
