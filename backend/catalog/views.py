from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import BasePermission
from django.db.models import Q, Count, Min, Max
from django.db.models.deletion import ProtectedError
from django.db import transaction
from decimal import Decimal, InvalidOperation

from .models import Category, Brand, Product, ProductAttribute
from .serializers import (
    CategorySerializer,
    BrandSerializer,
    ProductListSerializer,
    ProductDetailSerializer,
    AdminProductCreateSerializer,
    AdminProductOutSerializer,
    AdminCategoryCreateSerializer,
    AdminBrandSerializer,
    AdminProductImportSerializer,
)
from .importers import import_products_from_ozon_excel

MAX_FILTER_BRANDS = 200
MAX_FILTER_ATTRIBUTE_GROUPS = 40
MAX_FILTER_VALUES_PER_ATTRIBUTE = 18


def collect_category_descendants(category_id):
    pairs = list(Category.objects.values_list('id', 'parent_id'))
    children_map = {}
    for item_id, parent_id in pairs:
        children_map.setdefault(parent_id, []).append(item_id)

    collected = []
    stack = [category_id]
    while stack:
        current = stack.pop()
        if current in collected:
            continue
        collected.append(current)
        stack.extend(children_map.get(current, []))
    return collected


def parse_facet_filters(raw_values):
    parsed = {}
    for raw in raw_values:
        if not raw or '::' not in raw:
            continue
        name, value = raw.split('::', 1)
        name = str(name or '').strip()
        value = str(value or '').strip()
        if not name or not value:
            continue
        parsed.setdefault(name, set()).add(value)
    return parsed


def parse_int(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_decimal(raw_value):
    if raw_value in (None, ''):
        return None
    normalized = str(raw_value).strip().replace(',', '.')
    try:
        return Decimal(normalized)
    except (TypeError, ValueError, InvalidOperation):
        return None


def apply_catalog_filters(qs, request, *, ignore_brand=False, ignore_facets=False):
    category_id = parse_int(request.query_params.get('category'))
    if request.query_params.get('category') not in (None, '') and category_id is None:
        return None, Response({'detail': 'Некорректная категория'}, status=status.HTTP_400_BAD_REQUEST)
    if category_id is not None:
        root_category_id = category_id
        category_ids = collect_category_descendants(root_category_id)
        qs = qs.filter(category_id__in=category_ids)

    if not ignore_brand:
        brand_id = parse_int(request.query_params.get('brand'))
        if request.query_params.get('brand') not in (None, '') and brand_id is None:
            return None, Response({'detail': 'Некорректный бренд'}, status=status.HTTP_400_BAD_REQUEST)
        if brand_id is not None:
            qs = qs.filter(brand_id=brand_id)

    search = str(request.query_params.get('search') or '').strip()
    if search:
        qs = qs.filter(name__icontains=search)

    price_min = parse_decimal(request.query_params.get('price_min'))
    price_max = parse_decimal(request.query_params.get('price_max'))
    if request.query_params.get('price_min') not in (None, '') and price_min is None:
        return None, Response({'detail': 'Некорректная минимальная цена'}, status=status.HTTP_400_BAD_REQUEST)
    if request.query_params.get('price_max') not in (None, '') and price_max is None:
        return None, Response({'detail': 'Некорректная максимальная цена'}, status=status.HTTP_400_BAD_REQUEST)
    if price_min is not None and price_max is not None and price_min > price_max:
        return None, Response({'detail': 'Минимальная цена не может быть больше максимальной'}, status=status.HTTP_400_BAD_REQUEST)
    if price_min is not None:
        qs = qs.filter(price__gte=price_min)
    if price_max is not None:
        qs = qs.filter(price__lte=price_max)

    if not ignore_facets:
        facet_filters = parse_facet_filters(request.query_params.getlist('facet'))
        for facet_name, facet_values in facet_filters.items():
            qs = qs.filter(
                attributes__is_filterable=True,
                attributes__name__iexact=facet_name,
                attributes__value__in=list(facet_values),
            )

    return qs, None


class IsCatalogAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))


class CategoryListView(APIView):
    def get(self, request):
        qs = Category.objects.filter(is_active=True).select_related('parent').order_by('name')
        return Response(CategorySerializer(qs, many=True).data, status=status.HTTP_200_OK)


class BrandListView(APIView):
    def get(self, request):
        qs = Brand.objects.filter(is_active=True).order_by('name')
        return Response(BrandSerializer(qs, many=True).data, status=status.HTTP_200_OK)


class ProductListView(APIView):
    def get(self, request):
        qs = Product.objects.filter(is_active=True).select_related('category', 'brand').prefetch_related('images', 'attributes')
        qs, error_response = apply_catalog_filters(qs, request)
        if error_response is not None:
            return error_response

        qs = qs.order_by('-id').distinct()
        return Response(ProductListSerializer(qs, many=True).data, status=status.HTTP_200_OK)


class ProductDetailView(APIView):
    def get(self, request, pk: int):
        try:
            obj = Product.objects.select_related('category', 'brand').prefetch_related('images', 'attributes').get(id=pk, is_active=True)
        except Product.DoesNotExist:
            return Response({'detail': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ProductDetailSerializer(obj).data, status=status.HTTP_200_OK)


class CatalogFiltersView(APIView):
    def get(self, request):
        selected_facet_filters = parse_facet_filters(request.query_params.getlist('facet'))
        selected_brand_id = parse_int(request.query_params.get('brand'))
        base_qs = Product.objects.filter(is_active=True).select_related('brand')
        base_qs, error_response = apply_catalog_filters(base_qs, request)
        if error_response is not None:
            return error_response
        brand_qs = Product.objects.filter(is_active=True).select_related('brand')
        brand_qs, brand_error_response = apply_catalog_filters(brand_qs, request, ignore_brand=True)
        if brand_error_response is not None:
            return brand_error_response

        base_qs = base_qs.distinct()
        brand_qs = brand_qs.distinct()
        products_count = base_qs.count()

        price_agg = base_qs.aggregate(min_price=Min('price'), max_price=Max('price'))

        brands_qs = (
            brand_qs.filter(brand_id__isnull=False)
            .values('brand_id', 'brand__name')
            .annotate(count=Count('id', distinct=True))
            .order_by('-count', 'brand__name')
        )
        brands_total = brands_qs.count()
        brands = list(brands_qs[:MAX_FILTER_BRANDS])

        if selected_brand_id is not None and not any(item['brand_id'] == selected_brand_id for item in brands):
            selected_brand_row = brands_qs.filter(brand_id=selected_brand_id).first()
            if selected_brand_row is not None:
                brands.append(selected_brand_row)
                brands.sort(key=lambda item: (-item['count'], item['brand__name'] or ''))

        attribute_base_qs = ProductAttribute.objects.filter(
            product__in=base_qs,
            is_filterable=True,
        )

        attribute_names_qs = (
            attribute_base_qs
            .values('name')
            .annotate(total=Count('id', distinct=True))
            .order_by('-total', 'name')
        )
        attributes_total = attribute_names_qs.count()
        attribute_names = [item['name'] for item in attribute_names_qs[:MAX_FILTER_ATTRIBUTE_GROUPS]]
        for selected_name in selected_facet_filters.keys():
            if selected_name and selected_name not in attribute_names:
                attribute_names.append(selected_name)

        attributes_rows = []
        if attribute_names:
            attributes_rows = list(
                attribute_base_qs.filter(name__in=attribute_names)
                .values('name', 'value')
                .annotate(count=Count('id', distinct=True))
                .order_by('name', '-count', 'value')
            )

        grouped_attributes = {}
        for row in attributes_rows:
            name = row['name']
            grouped_attributes.setdefault(name, []).append({
                'value': row['value'],
                'count': row['count'],
            })

        attributes = []
        for name in sorted(grouped_attributes.keys(), key=lambda value: value.lower()):
            values = grouped_attributes[name]
            selected_values = selected_facet_filters.get(name, set())
            values_slice = values[:MAX_FILTER_VALUES_PER_ATTRIBUTE]
            existing_values = {item['value'] for item in values_slice}
            if selected_values:
                for selected_value in selected_values:
                    if selected_value in existing_values:
                        continue
                    selected_match = next((item for item in values if item['value'] == selected_value), None)
                    if selected_match is not None:
                        values_slice.append(selected_match)
                        existing_values.add(selected_value)
            attributes.append({
                'name': name,
                'total_values': len(values),
                'values': values_slice,
            })

        return Response({
            'price': {
                'min': float(price_agg['min_price']) if price_agg['min_price'] is not None else None,
                'max': float(price_agg['max_price']) if price_agg['max_price'] is not None else None,
            },
            'brands': [
                {
                    'id': item['brand_id'],
                    'name': item['brand__name'],
                    'count': item['count'],
                }
                for item in brands
            ],
            'attributes': attributes,
            'products_count': products_count,
            'brands_total': brands_total,
            'attributes_total': attributes_total,
            'brands_limited': brands_total > len(brands),
            'attributes_limited': attributes_total > len(attributes),
        }, status=status.HTTP_200_OK)


class AdminProductListCreateView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Product.objects.select_related('category', 'brand').prefetch_related('images', 'attributes').order_by('-id')

    def get(self, request):
        qs = self.get_queryset()
        page_size = 10

        is_active = request.query_params.get('is_active')
        if is_active == 'true':
            qs = qs.filter(is_active=True)
        elif is_active == 'false':
            qs = qs.filter(is_active=False)

        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))

        try:
            page = max(int(request.query_params.get('page', '1')), 1)
        except (TypeError, ValueError):
            page = 1

        total = qs.count()
        total_pages = max((total + page_size - 1) // page_size, 1)
        if page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size

        items = qs[start:end]
        return Response({
            'results': AdminProductOutSerializer(items, many=True).data,
            'count': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        product = self.get_queryset().get(id=product.id)
        return Response(AdminProductOutSerializer(product).data, status=status.HTTP_201_CREATED)


class AdminProductDetailView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Product.objects.select_related('category', 'brand').prefetch_related('images', 'attributes')

    def patch(self, request, pk: int):
        try:
            product = self.get_queryset().get(id=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminProductCreateSerializer(instance=product, data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        product = self.get_queryset().get(id=product.id)
        return Response(AdminProductOutSerializer(product).data, status=status.HTTP_200_OK)

    def put(self, request, pk: int):
        return self.patch(request, pk)

    def delete(self, request, pk: int):
        try:
            with transaction.atomic():
                product = Product.objects.select_for_update().get(id=pk)

                blockers = []

                in_carts = product.cart_items.count()
                if in_carts:
                    blockers.append(f'товар находится в корзинах ({in_carts})')

                in_active_orders = product.order_items.filter(order__status__in=['new', 'paid', 'shipped']).count()
                if in_active_orders:
                    blockers.append(f'товар участвует в активных заказах ({in_active_orders})')

                reviews_count = product.reviews.count()
                if reviews_count:
                    blockers.append(f'у товара есть отзывы ({reviews_count})')

                if blockers:
                    return Response(
                        {'detail': 'Нельзя удалить товар: ' + '; '.join(blockers)},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                product.delete()
        except Product.DoesNotExist:
            return Response({'detail': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)
        except ProtectedError:
            return Response(
                {'detail': 'Нельзя удалить товар: есть связанные записи'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminCategoryListCreateView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Category.objects.select_related('parent').order_by('name')

    def get(self, request):
        return Response({'results': CategorySerializer(self.get_queryset(), many=True).data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminCategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        category = self.get_queryset().get(id=category.id)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class AdminCategoryDetailView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Category.objects.select_related('parent').order_by('name')

    def patch(self, request, pk: int):
        try:
            category = self.get_queryset().get(id=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Категория не найдена'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminCategoryCreateSerializer(instance=category, data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        category = self.get_queryset().get(id=category.id)
        return Response(CategorySerializer(category).data, status=status.HTTP_200_OK)

    def put(self, request, pk: int):
        return self.patch(request, pk)

    def delete(self, request, pk: int):
        try:
            category = self.get_queryset().get(id=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Категория не найдена'}, status=status.HTTP_404_NOT_FOUND)

        blockers = []
        child_count = category.children.count()
        if child_count:
            blockers.append(f'есть подкатегории ({child_count})')

        products_count = category.products.count()
        if products_count:
            blockers.append(f'есть товары в категории ({products_count})')

        if blockers:
            return Response(
                {'detail': 'Нельзя удалить категорию: ' + '; '.join(blockers)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            category.delete()
        except ProtectedError:
            return Response(
                {'detail': 'Нельзя удалить категорию: есть связанные данные'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminBrandListCreateView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Brand.objects.order_by('name')

    def get(self, request):
        return Response({'results': BrandSerializer(self.get_queryset(), many=True).data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminBrandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        brand = serializer.save()
        brand = self.get_queryset().get(id=brand.id)
        return Response(BrandSerializer(brand).data, status=status.HTTP_201_CREATED)


class AdminBrandDetailView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Brand.objects.order_by('name')

    def patch(self, request, pk: int):
        try:
            brand = self.get_queryset().get(id=pk)
        except Brand.DoesNotExist:
            return Response({'detail': 'Бренд не найден'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminBrandSerializer(instance=brand, data=request.data)
        serializer.is_valid(raise_exception=True)
        brand = serializer.save()
        brand = self.get_queryset().get(id=brand.id)
        return Response(BrandSerializer(brand).data, status=status.HTTP_200_OK)

    def put(self, request, pk: int):
        return self.patch(request, pk)

    def delete(self, request, pk: int):
        try:
            brand = self.get_queryset().get(id=pk)
        except Brand.DoesNotExist:
            return Response({'detail': 'Бренд не найден'}, status=status.HTTP_404_NOT_FOUND)

        products_count = brand.products.count()
        if products_count:
            return Response(
                {'detail': f'Нельзя удалить бренд: есть связанные товары ({products_count})'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            brand.delete()
        except ProtectedError:
            return Response(
                {'detail': 'Нельзя удалить бренд: есть связанные данные'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminProductImportView(APIView):
    permission_classes = [IsCatalogAdmin]

    def post(self, request):
        serializer = AdminProductImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report = import_products_from_ozon_excel(
            serializer.validated_data['file'],
            stock_default=serializer.validated_data['stock_default'],
            is_active=serializer.validated_data['is_active'],
        )
        return Response(report, status=status.HTTP_200_OK)
