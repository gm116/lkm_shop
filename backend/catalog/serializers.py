from decimal import Decimal

from django.utils.text import slugify
from rest_framework import serializers
from .models import Category, Brand, Product, ProductImage, ProductAttribute


def build_unique_category_slug(name, instance=None):
    base_slug = slugify(name) or 'category'
    slug = base_slug
    suffix = 2

    qs = Category.objects.all()
    if instance is not None:
        qs = qs.exclude(id=instance.id)

    while qs.filter(slug=slug).exists():
        slug = f'{base_slug}-{suffix}'
        suffix += 1

    return slug


def build_unique_brand_slug(name, instance=None):
    base_slug = slugify(name) or 'brand'
    slug = base_slug
    suffix = 2

    qs = Brand.objects.all()
    if instance is not None:
        qs = qs.exclude(id=instance.id)

    while qs.filter(slug=slug).exists():
        slug = f'{base_slug}-{suffix}'
        suffix += 1

    return slug


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'parent', 'is_active')


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ('id', 'name', 'slug', 'is_active')


class ProductAttributeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAttribute
        fields = ('name', 'value', 'is_filterable', 'sort_order')


class ProductListSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    brand = BrandSerializer()
    image = serializers.SerializerMethodField()
    characteristics = serializers.SerializerMethodField()

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
            'characteristics',
        )

    def get_image(self, obj):
        img = obj.images.order_by('sort_order', 'id').first()
        return img.image_url if img else None

    def get_characteristics(self, obj):
        return ProductAttributeSerializer(obj.attributes.all(), many=True).data


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    brand = BrandSerializer()
    images = serializers.SerializerMethodField()
    characteristics = serializers.SerializerMethodField()

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
            'characteristics',
        )

    def get_images(self, obj):
        return [img.image_url for img in obj.images.order_by('sort_order', 'id')]

    def get_characteristics(self, obj):
        return ProductAttributeSerializer(obj.attributes.all(), many=True).data


class AdminProductImageInSerializer(serializers.Serializer):
    image_url = serializers.URLField()
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)


class AdminProductAttributeInSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    value = serializers.CharField(max_length=255)
    is_filterable = serializers.BooleanField(required=False, default=True)
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)

    def validate(self, attrs):
        attrs['name'] = str(attrs.get('name') or '').strip()
        attrs['value'] = str(attrs.get('value') or '').strip()

        if not attrs['name']:
            raise serializers.ValidationError({'name': 'Название характеристики обязательно'})
        if not attrs['value']:
            raise serializers.ValidationError({'value': 'Значение характеристики обязательно'})

        return attrs


class AdminProductCreateSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    brand_id = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.CharField(max_length=200)
    slug = serializers.SlugField(max_length=220, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    stock = serializers.IntegerField(min_value=0)
    is_active = serializers.BooleanField(required=False, default=True)
    images = AdminProductImageInSerializer(many=True, required=False)
    characteristics = AdminProductAttributeInSerializer(many=True, required=False)

    def validate_category_id(self, value):
        if not Category.objects.filter(id=value).exists():
            raise serializers.ValidationError('Категория не найдена')
        return value

    def validate_brand_id(self, value):
        if value in (None, ''):
            return None
        if not Brand.objects.filter(id=value).exists():
            raise serializers.ValidationError('Бренд не найден')
        return value

    def validate_price(self, value):
        if value != value.quantize(Decimal('1')):
            raise serializers.ValidationError('Цена должна быть указана в рублях без копеек')
        return value

    def validate(self, attrs):
        name = attrs.get('name', '').strip()
        slug = (attrs.get('slug') or '').strip()
        sku = attrs.get('sku')
        instance = getattr(self, 'instance', None)

        if not slug:
            slug = slugify(name)
        if not slug:
            raise serializers.ValidationError({'slug': 'Не удалось сформировать slug'})

        qs = Product.objects.filter(slug=slug)
        if instance is not None:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError({'slug': 'Товар с таким slug уже существует'})

        if sku:
            sku = sku.strip()
            sku_qs = Product.objects.filter(sku=sku)
            if instance is not None:
                sku_qs = sku_qs.exclude(id=instance.id)
            if sku_qs.exists():
                raise serializers.ValidationError({'sku': 'Товар с таким SKU уже существует'})
            attrs['sku'] = sku
        else:
            attrs['sku'] = None

        attrs['name'] = name
        attrs['slug'] = slug
        attrs['description'] = (attrs.get('description') or '').strip()

        attributes = attrs.get('characteristics') or []
        unique_keys = set()
        normalized_attributes = []
        for item in attributes:
            unique_key = (item['name'].lower(), item['value'].lower())
            if unique_key in unique_keys:
                continue
            unique_keys.add(unique_key)
            normalized_attributes.append(item)
        attrs['characteristics'] = normalized_attributes
        return attrs

    def create(self, validated_data):
        images_data = validated_data.pop('images', [])
        attributes_data = validated_data.pop('characteristics', [])
        category_id = validated_data.pop('category_id')
        brand_id = validated_data.pop('brand_id', None)

        product = Product.objects.create(
            category_id=category_id,
            brand_id=brand_id,
            **validated_data,
        )

        image_objects = [
            ProductImage(
                product=product,
                image_url=image['image_url'],
                sort_order=image.get('sort_order', 0) or 0,
            )
            for image in images_data
        ]
        if image_objects:
            ProductImage.objects.bulk_create(image_objects)

        if attributes_data:
            ProductAttribute.objects.bulk_create([
                ProductAttribute(
                    product=product,
                    name=item['name'],
                    value=item['value'],
                    is_filterable=item.get('is_filterable', True),
                    sort_order=item.get('sort_order', 0) or 0,
                )
                for item in attributes_data
            ])

        return product

    def update(self, instance, validated_data):
        images_data = validated_data.pop('images', None)
        attributes_data = validated_data.pop('characteristics', None)
        category_id = validated_data.pop('category_id')
        brand_id = validated_data.pop('brand_id', None)

        instance.category_id = category_id
        instance.brand_id = brand_id
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if images_data is not None:
            instance.images.all().delete()
            image_objects = [
                ProductImage(
                    product=instance,
                    image_url=image['image_url'],
                    sort_order=image.get('sort_order', 0) or 0,
                )
                for image in images_data
            ]
            if image_objects:
                ProductImage.objects.bulk_create(image_objects)

        if attributes_data is not None:
            instance.attributes.all().delete()
            if attributes_data:
                ProductAttribute.objects.bulk_create([
                    ProductAttribute(
                        product=instance,
                        name=item['name'],
                        value=item['value'],
                        is_filterable=item.get('is_filterable', True),
                        sort_order=item.get('sort_order', 0) or 0,
                    )
                    for item in attributes_data
                ])

        return instance


class AdminProductOutSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    brand = BrandSerializer(allow_null=True)
    images = serializers.SerializerMethodField()
    characteristics = serializers.SerializerMethodField()

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
            'characteristics',
            'created_at',
            'updated_at',
        )

    def get_images(self, obj):
        return [
            {
                'id': image.id,
                'image_url': image.image_url,
                'sort_order': image.sort_order,
            }
            for image in obj.images.order_by('sort_order', 'id')
        ]

    def get_characteristics(self, obj):
        return [
            {
                'name': item.name,
                'value': item.value,
                'is_filterable': item.is_filterable,
                'sort_order': item.sort_order,
            }
            for item in obj.attributes.order_by('sort_order', 'name', 'id')
        ]


class AdminCategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=140, required=False, allow_blank=True)
    parent_id = serializers.IntegerField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_parent_id(self, value):
        if value in (None, ''):
            return None
        instance = getattr(self, 'instance', None)
        if instance is not None and instance.id == value:
            raise serializers.ValidationError('Категория не может быть родителем самой себе')
        if not Category.objects.filter(id=value).exists():
            raise serializers.ValidationError('Родительская категория не найдена')
        return value

    def validate(self, attrs):
        name = attrs.get('name', '').strip()
        slug = (attrs.get('slug') or '').strip()
        parent_id = attrs.get('parent_id')
        instance = getattr(self, 'instance', None)

        if not name:
            raise serializers.ValidationError({'name': 'Введите название категории'})

        qs = Category.objects.filter(parent_id=parent_id, name=name)
        if instance is not None:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError({'name': 'Категория с таким названием уже существует на этом уровне'})

        attrs['name'] = name
        if slug:
            slug_qs = Category.objects.filter(slug=slug)
            if instance is not None:
                slug_qs = slug_qs.exclude(id=instance.id)
            if slug_qs.exists():
                raise serializers.ValidationError({'slug': 'Категория с таким slug уже существует'})
            attrs['slug'] = slug
        else:
            attrs['slug'] = build_unique_category_slug(name, instance=instance)
        return attrs

    def create(self, validated_data):
        parent_id = validated_data.pop('parent_id', None)
        return Category.objects.create(parent_id=parent_id, **validated_data)

    def update(self, instance, validated_data):
        instance.name = validated_data['name']
        instance.slug = validated_data['slug']
        instance.parent_id = validated_data.get('parent_id')
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.save()
        return instance


class AdminBrandSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=140, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        name = attrs.get('name', '').strip()
        slug = (attrs.get('slug') or '').strip()
        instance = getattr(self, 'instance', None)

        if not name:
            raise serializers.ValidationError({'name': 'Введите название бренда'})

        name_qs = Brand.objects.filter(name__iexact=name)
        if instance is not None:
            name_qs = name_qs.exclude(id=instance.id)
        if name_qs.exists():
            raise serializers.ValidationError({'name': 'Бренд с таким названием уже существует'})

        attrs['name'] = name
        if slug:
            slug_qs = Brand.objects.filter(slug=slug)
            if instance is not None:
                slug_qs = slug_qs.exclude(id=instance.id)
            if slug_qs.exists():
                raise serializers.ValidationError({'slug': 'Бренд с таким slug уже существует'})
            attrs['slug'] = slug
        else:
            attrs['slug'] = build_unique_brand_slug(name, instance=instance)

        return attrs

    def create(self, validated_data):
        return Brand.objects.create(**validated_data)

    def update(self, instance, validated_data):
        instance.name = validated_data['name']
        instance.slug = validated_data['slug']
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.save()
        return instance


class AdminProductImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    stock_default = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_file(self, value):
        filename = (value.name or '').lower()
        if not filename.endswith('.xlsx'):
            raise serializers.ValidationError('Поддерживаются только файлы .xlsx')
        return value
