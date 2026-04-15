from django.conf import settings
from django.db import models


class PendingRegistration(models.Model):
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=128)
    code_hash = models.CharField(max_length=256)
    code_expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    last_sent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Pending Registration'
        verbose_name_plural = 'Pending Registrations'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['code_expires_at']),
            models.Index(fields=['updated_at']),
        ]

    def __str__(self):
        return f'{self.email} ({self.code_expires_at})'


class PendingEmailChange(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pending_email_change')
    new_email = models.EmailField()
    code_hash = models.CharField(max_length=256)
    code_expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    last_sent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Pending Email Change'
        verbose_name_plural = 'Pending Email Changes'
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['new_email']),
            models.Index(fields=['code_expires_at']),
            models.Index(fields=['updated_at']),
        ]

    def __str__(self):
        return f'{self.user_id} -> {self.new_email}'


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
