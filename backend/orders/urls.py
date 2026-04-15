from django.urls import path
from .views import OrderCreateFromCartView, MyOrdersView, OrderDetailView, RepeatOrderView

urlpatterns = [
    path('create-from-cart/', OrderCreateFromCartView.as_view()),
    path('my/', MyOrdersView.as_view()),
    path('<int:order_id>/repeat/', RepeatOrderView.as_view()),
    path('<int:order_id>/', OrderDetailView.as_view()),
]
