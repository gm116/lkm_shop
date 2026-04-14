from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import BasePermission
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.db import transaction

from .models import Category, Brand, Product
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
        qs = Product.objects.filter(is_active=True).select_related('category', 'brand').prefetch_related('images')

        category_id = request.query_params.get('category')
        if category_id:
            try:
                root_category_id = int(category_id)
            except (TypeError, ValueError):
                return Response({'detail': 'Некорректная категория'}, status=status.HTTP_400_BAD_REQUEST)

            category_ids = collect_category_descendants(root_category_id)
            qs = qs.filter(category_id__in=category_ids)

        brand_id = request.query_params.get('brand')
        if brand_id:
            qs = qs.filter(brand_id=brand_id)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        qs = qs.order_by('-id')
        return Response(ProductListSerializer(qs, many=True).data, status=status.HTTP_200_OK)


class ProductDetailView(APIView):
    def get(self, request, pk: int):
        try:
            obj = Product.objects.select_related('category', 'brand').prefetch_related('images').get(id=pk, is_active=True)
        except Product.DoesNotExist:
            return Response({'detail': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ProductDetailSerializer(obj).data, status=status.HTTP_200_OK)


class AdminProductListCreateView(APIView):
    permission_classes = [IsCatalogAdmin]

    def get_queryset(self):
        return Product.objects.select_related('category', 'brand').prefetch_related('images').order_by('-id')

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
        return Product.objects.select_related('category', 'brand').prefetch_related('images')

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
