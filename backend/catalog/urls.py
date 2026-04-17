from django.urls import path
from .views import (
    CategoryListView,
    BrandListView,
    ProductListView,
    ProductDetailView,
    CatalogFiltersView,
    AdminProductListCreateView,
    AdminProductDetailView,
    AdminCategoryListCreateView,
    AdminCategoryDetailView,
    AdminBrandListCreateView,
    AdminBrandDetailView,
    AdminProductImportView,
)

urlpatterns = [
    path('categories/', CategoryListView.as_view()),
    path('brands/', BrandListView.as_view()),
    path('products/', ProductListView.as_view()),
    path('products/<int:pk>/', ProductDetailView.as_view()),
    path('filters/', CatalogFiltersView.as_view()),
    path('admin/products/', AdminProductListCreateView.as_view()),
    path('admin/products/<int:pk>/', AdminProductDetailView.as_view()),
    path('admin/products/import/', AdminProductImportView.as_view()),
    path('admin/categories/', AdminCategoryListCreateView.as_view()),
    path('admin/categories/<int:pk>/', AdminCategoryDetailView.as_view()),
    path('admin/brands/', AdminBrandListCreateView.as_view()),
    path('admin/brands/<int:pk>/', AdminBrandDetailView.as_view()),
]
