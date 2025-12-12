from django.contrib import admin
from .models import Address


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'city', 'address_line', 'is_default', 'created_at')
    list_filter = ('is_default', 'city')
    search_fields = ('user__username', 'user__email', 'city', 'address_line')
    ordering = ('-id',)