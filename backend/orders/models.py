from django.conf import settings
from django.db import models


class OrderStatus(models.TextChoices):
    NEW = 'new', 'New'
    PAID = 'paid', 'Paid'
    SHIPPED = 'shipped', 'Shipped'
    COMPLETED = 'completed', 'Completed'
    CANCELED = 'canceled', 'Canceled'


class DeliveryType(models.TextChoices):
    STORE_PICKUP = 'store_pickup', 'Store pickup'
    COURIER = 'courier', 'Courier'
    PVZ = 'pvz', 'PVZ'

class Order(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )

    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.NEW)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    customer_name = models.CharField(max_length=120)
    customer_phone = models.CharField(max_length=30)
    customer_email = models.EmailField(blank=True)

    delivery_type = models.CharField(max_length=20, choices=DeliveryType.choices, default=DeliveryType.STORE_PICKUP)

    delivery_city = models.CharField(max_length=120, blank=True)
    delivery_address_text = models.TextField(blank=True)

    pickup_point_data = models.JSONField(null=True, blank=True)
    delivery_service = models.CharField(max_length=80, blank=True)

    delivery_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    comment = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['user', '-id']),
            models.Index(fields=['delivery_type']),
        ]

    def __str__(self):
        return f'Order#{self.id}'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')

    product = models.ForeignKey('catalog.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='order_items')

    product_name_snapshot = models.CharField(max_length=200)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField()

    class Meta:
        indexes = [
            models.Index(fields=['order']),
            models.Index(fields=['product']),
        ]

    def __str__(self):
        return f'OrderItem#{self.id}'