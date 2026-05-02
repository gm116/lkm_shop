import uuid
from django.db import models

class Payment(models.Model):
    class Provider(models.TextChoices):
        YOOKASSA = 'yookassa', 'YooKassa'

    class Status(models.TextChoices):
        PENDING = 'pending', 'pending'
        WAITING_FOR_CAPTURE = 'waiting_for_capture', 'waiting_for_capture'
        SUCCEEDED = 'succeeded', 'succeeded'
        CANCELED = 'canceled', 'canceled'
        FAILED = 'failed', 'failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    provider = models.CharField(max_length=32, choices=Provider.choices, default=Provider.YOOKASSA)

    # ВОТ ЭТО — вместо импорта Order / apps.get_model
    order = models.ForeignKey('orders.Order', on_delete=models.PROTECT, related_name='payments')

    amount_value = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='RUB')

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)

    provider_payment_id = models.CharField(max_length=128, blank=True, default='')
    idempotence_key = models.CharField(max_length=64, blank=True, default='')

    confirmation_url = models.URLField(blank=True, default='')

    raw = models.JSONField(null=True, blank=True)

    paid_at = models.DateTimeField(null=True, blank=True)
    paid_email_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['provider', 'provider_payment_id']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['order', 'created_at']),
        ]

    def __str__(self):
        return f'{self.provider}:{self.provider_payment_id or self.id}'


class PaymentWebhookEvent(models.Model):
    """
    Фиксируем уже обработанные webhook-сообщения для защиты от replay.
    """
    provider = models.CharField(max_length=32, default=Payment.Provider.YOOKASSA)
    event_type = models.CharField(max_length=64)
    provider_payment_id = models.CharField(max_length=128, db_index=True)
    payment_status = models.CharField(max_length=32, blank=True, default='')
    payload_hash = models.CharField(max_length=64, unique=True)
    raw = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['provider', 'provider_payment_id', 'created_at']),
            models.Index(fields=['event_type', 'created_at']),
        ]

    def __str__(self):
        return f'{self.provider}:{self.event_type}:{self.provider_payment_id}'
