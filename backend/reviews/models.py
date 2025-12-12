from django.conf import settings
from django.db import models


class Review(models.Model):
    product = models.ForeignKey('catalog.Product', on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')

    rating = models.PositiveSmallIntegerField()
    text = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']
        constraints = [
            models.UniqueConstraint(fields=['product', 'user'], name='uniq_review_product_user'),
        ]
        indexes = [
            models.Index(fields=['product', '-id']),
            models.Index(fields=['user', '-id']),
        ]

    def __str__(self):
        return f'Review#{self.id}'