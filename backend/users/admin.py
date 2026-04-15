from django.contrib import admin
from .models import Address, PendingRegistration, PendingEmailChange


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'city', 'address_line', 'is_default', 'created_at')
    list_filter = ('is_default', 'city')
    search_fields = ('user__username', 'user__email', 'city', 'address_line')
    ordering = ('-id',)


@admin.register(PendingRegistration)
class PendingRegistrationAdmin(admin.ModelAdmin):
    list_display = ('id', 'email', 'code_expires_at', 'attempts', 'last_sent_at', 'updated_at')
    search_fields = ('email',)
    ordering = ('-updated_at',)


@admin.register(PendingEmailChange)
class PendingEmailChangeAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'new_email', 'code_expires_at', 'attempts', 'last_sent_at', 'updated_at')
    search_fields = ('user__username', 'user__email', 'new_email')
    ordering = ('-updated_at',)
