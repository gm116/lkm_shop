from django.conf import settings
from django.db import models


class Address(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='addresses')

    label = models.CharField(max_length=80, blank=True)

    city = models.CharField(max_length=120)
    address_line = models.CharField(max_length=255)

    recipient_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)

    comment = models.CharField(max_length=300, blank=True)
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', '-id']
        verbose_name = 'Address'
        verbose_name_plural = 'Addresses'
        indexes = [
            models.Index(fields=['user', '-is_default']),
            models.Index(fields=['user', '-id']),
        ]

    def __str__(self):
        return f'{self.user_id}: {self.city}, {self.address_line}'