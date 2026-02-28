from django.urls import path
from .views import CreatePaymentView, YooKassaWebhookView, PaymentSyncView

urlpatterns = [
    path('create/', CreatePaymentView.as_view()),
    path('webhook/yookassa/', YooKassaWebhookView.as_view()),
    path('sync/<int:order_id>/', PaymentSyncView.as_view()),
]
