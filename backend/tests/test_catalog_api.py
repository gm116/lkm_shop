from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Brand, Category, Product, ProductAttribute, ProductImage


class PublicCatalogApiTests(APITestCase):
    def setUp(self):
        self.root = Category.objects.create(name='ЛКМ', slug='lkm', is_active=True)
        self.child = Category.objects.create(name='Лаки', slug='laki', parent=self.root, is_active=True)
        self.leaf = Category.objects.create(name='Грунты', slug='grunty', parent=self.child, is_active=True)
        self.inactive_category = Category.objects.create(name='Скрытая', slug='hidden', is_active=False)

        self.brand_a = Brand.objects.create(name='Brand A', slug='brand-a', is_active=True)
        self.brand_b = Brand.objects.create(name='Brand B', slug='brand-b', is_active=True)
        self.brand_inactive = Brand.objects.create(name='Brand Hidden', slug='brand-hidden', is_active=False)

        self.p1 = Product.objects.create(
            category=self.child,
            brand=self.brand_a,
            name='Лак Alpha',
            slug='lak-alpha',
            sku='ALPHA-100',
            price=Decimal('1000.00'),
            stock=5,
            is_active=True,
        )
        self.p2 = Product.objects.create(
            category=self.leaf,
            brand=self.brand_a,
            name='Грунт Beta',
            slug='grunt-beta',
            sku='BETA-200',
            price=Decimal('2000.00'),
            stock=0,
            is_active=True,
        )
        self.p3 = Product.objects.create(
            category=self.root,
            brand=self.brand_b,
            name='Эмаль Gamma',
            slug='emal-gamma',
            sku='GAMMA-300',
            price=Decimal('3000.00'),
            stock=3,
            is_active=True,
        )
        self.p4_inactive = Product.objects.create(
            category=self.root,
            brand=self.brand_a,
            name='Скрытый товар',
            slug='hidden-product',
            sku='HIDE-001',
            price=Decimal('1500.00'),
            stock=10,
            is_active=False,
        )
        self.p5_no_brand = Product.objects.create(
            category=self.root,
            brand=None,
            name='Раствор NullBrand',
            slug='rastvor-nullbrand',
            sku='NULL-500',
            price=Decimal('500.00'),
            stock=2,
            is_active=True,
        )

        ProductImage.objects.create(product=self.p1, image_url='https://example.com/a.jpg', sort_order=0)
        ProductImage.objects.create(product=self.p2, image_url='https://example.com/b.jpg', sort_order=0)

        ProductAttribute.objects.create(product=self.p1, name='Степень блеска', value='Глянцевый', is_filterable=True)
        ProductAttribute.objects.create(product=self.p1, name='Основа', value='Акрил', is_filterable=True)
        ProductAttribute.objects.create(product=self.p2, name='Степень блеска', value='Матовый', is_filterable=True)
        ProductAttribute.objects.create(product=self.p3, name='Основа', value='Акрил', is_filterable=True)
        ProductAttribute.objects.create(product=self.p3, name='Цвет', value='Черный', is_filterable=True)
        ProductAttribute.objects.create(product=self.p3, name='Служебное', value='Не для фильтра', is_filterable=False)

    def _product_ids(self, response):
        return [item['id'] for item in response.data]

    def test_categories_returns_active_tree_with_parent_links(self):
        response = self.client.get('/api/catalog/categories/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)

        by_id = {item['id']: item for item in response.data}
        self.assertIn(self.root.id, by_id)
        self.assertIn(self.child.id, by_id)
        self.assertIn(self.leaf.id, by_id)
        self.assertNotIn(self.inactive_category.id, by_id)

        self.assertIsNone(by_id[self.root.id]['parent'])
        self.assertEqual(by_id[self.child.id]['parent'], self.root.id)
        self.assertEqual(by_id[self.leaf.id]['parent'], self.child.id)

    def test_brands_returns_only_active(self):
        response = self.client.get('/api/catalog/brands/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertIn(self.brand_a.id, ids)
        self.assertIn(self.brand_b.id, ids)
        self.assertNotIn(self.brand_inactive.id, ids)

    def test_products_without_filters_returns_only_active_and_desc_order(self):
        response = self.client.get('/api/catalog/products/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._product_ids(response)
        self.assertNotIn(self.p4_inactive.id, ids)
        self.assertEqual(ids, sorted(ids, reverse=True))

    def test_search_by_name(self):
        response = self.client.get('/api/catalog/products/?search=Alpha')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._product_ids(response), [self.p1.id])

    def test_search_by_sku(self):
        response = self.client.get('/api/catalog/products/?search=BETA-200')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._product_ids(response), [self.p2.id])

    def test_search_plus_category(self):
        response = self.client.get(f'/api/catalog/products/?category={self.root.id}&search=Грунт')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._product_ids(response), [self.p2.id])

    def test_search_plus_brand(self):
        response = self.client.get(f'/api/catalog/products/?brand={self.brand_b.id}&search=Gamma')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._product_ids(response), [self.p3.id])

    def test_price_filter_range(self):
        response = self.client.get('/api/catalog/products/?price_min=900&price_max=2500')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(self._product_ids(response), [self.p1.id, self.p2.id])

    def test_price_filter_invalid_range_returns_400(self):
        response = self.client.get('/api/catalog/products/?price_min=3000&price_max=1000')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Минимальная цена не может быть больше максимальной')

    def test_price_filter_supports_thousand_separators(self):
        response = self.client.get('/api/catalog/products/?price_min=1%20500&price_max=3%20000')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(self._product_ids(response), [self.p2.id, self.p3.id])

    def test_filters_facets_and_counts(self):
        response = self.client.get('/api/catalog/filters/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['products_count'], 4)
        self.assertIn('price', response.data)
        self.assertEqual(response.data['price']['min'], 500.0)
        self.assertEqual(response.data['price']['max'], 3000.0)

        brand_rows = {row['id']: row for row in response.data['brands']}
        self.assertEqual(brand_rows[self.brand_a.id]['count'], 2)
        self.assertEqual(brand_rows[self.brand_b.id]['count'], 1)
        self.assertNotIn(self.brand_inactive.id, brand_rows)

        attributes = {row['name']: row for row in response.data['attributes']}
        self.assertIn('Степень блеска', attributes)
        gloss_values = {row['value'] for row in attributes['Степень блеска']['values']}
        self.assertSetEqual(gloss_values, {'Глянцевый', 'Матовый'})
        self.assertNotIn('Служебное', attributes)

    def test_products_contract_fields_and_nullable_brand(self):
        response = self.client.get('/api/catalog/products/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data)

        sample = response.data[0]
        for key in ['id', 'name', 'slug', 'price', 'stock', 'is_active', 'category', 'brand', 'image', 'characteristics']:
            self.assertIn(key, sample)

        no_brand_row = next(item for item in response.data if item['id'] == self.p5_no_brand.id)
        self.assertIsNone(no_brand_row['brand'])

        category = sample['category']
        self.assertIsInstance(category['id'], int)
        self.assertIsInstance(category['name'], str)

        characteristics = sample['characteristics']
        self.assertIsInstance(characteristics, list)
        if characteristics:
            self.assertIn('name', characteristics[0])
            self.assertIn('value', characteristics[0])
