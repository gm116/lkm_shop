from django.urls import path
from .views import CartDetailView, CartSyncView, CartItemUpsertView, CartItemDeleteView, CartClearView

urlpatterns = [
    path('', CartDetailView.as_view()),                 # GET /api/cart/
    path('sync/', CartSyncView.as_view()),              # POST /api/cart/sync/
    path('items/', CartItemUpsertView.as_view()),       # POST /api/cart/items/
    path('items/<int:item_id>/', CartItemDeleteView.as_view()),  # DELETE /api/cart/items/<id>/
    path('clear/', CartClearView.as_view()),            # POST /api/cart/clear/
]