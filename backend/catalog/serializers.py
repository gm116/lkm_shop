from rest_framework import serializers
from .models import Category, Brand, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'parent')


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ('id', 'name', 'slug')


class ProductListSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    brand = BrandSerializer()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'slug',
            'price',
            'stock',
            'is_active',
            'category',
            'brand',
            'image',
        )

    def get_image(self, obj):
        img = obj.images.order_by('sort_order', 'id').first()
        return img.image_url if img else None


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    brand = BrandSerializer()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'slug',
            'description',
            'sku',
            'price',
            'stock',
            'is_active',
            'category',
            'brand',
            'images',
        )

    def get_images(self, obj):
        return [img.image_url for img in obj.images.order_by('sort_order', 'id')]
