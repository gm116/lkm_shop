from django.contrib import admin
from .models import Cart, CartItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    inlines = [CartItemInline]
    list_display = ('id', 'user', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('user__username', 'user__email')
    ordering = ('-id',)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'cart', 'product', 'quantity', 'price_snapshot', 'updated_at')
    search_fields = ('cart__id', 'product__name')
    ordering = ('-id',)