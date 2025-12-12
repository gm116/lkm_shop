from django.urls import path
from .views import CategoryListView, BrandListView, ProductListView, ProductDetailView

urlpatterns = [
    path('categories/', CategoryListView.as_view()),
    path('brands/', BrandListView.as_view()),
    path('products/', ProductListView.as_view()),
    path('products/<int:pk>/', ProductDetailView.as_view()),
]