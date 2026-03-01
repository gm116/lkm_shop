from django.urls import path
from .staff_views import StaffOrdersListView, StaffOrderDetailView, StaffOrderStatusUpdateView, StaffAnalyticsView

urlpatterns = [
    path('analytics/', StaffAnalyticsView.as_view()),
    path('orders/', StaffOrdersListView.as_view()),
    path('orders/<int:order_id>/', StaffOrderDetailView.as_view()),
    path('orders/<int:order_id>/status/', StaffOrderStatusUpdateView.as_view()),
]
