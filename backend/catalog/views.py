from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import Category, Brand, Product
from .serializers import CategorySerializer, BrandSerializer, ProductListSerializer, ProductDetailSerializer


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
            qs = qs.filter(category_id=category_id)

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
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ProductDetailSerializer(obj).data, status=status.HTTP_200_OK)