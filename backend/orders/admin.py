from django.contrib import admin
from django.db.models import Count

from .models import Order, OrderItem, OrderStatus


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ('product', 'product_name_snapshot', 'price_snapshot', 'quantity')
    fields = ('product', 'product_name_snapshot', 'price_snapshot', 'quantity')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    inlines = [OrderItemInline]

    list_display = (
        'id',
        'status',
        'delivery_type',
        'delivery_service',
        'total_amount',
        'items_count',
        'customer_name',
        'customer_phone',
        'created_at',
    )
    list_filter = ('status', 'delivery_type', 'delivery_service', 'created_at')
    search_fields = ('id', 'customer_name', 'customer_phone', 'customer_email')
    ordering = ('-id',)
    date_hierarchy = 'created_at'
    list_select_related = ('user',)
    list_per_page = 50
    autocomplete_fields = ('user',)

    readonly_fields = ('created_at', 'updated_at', 'total_amount')

    fieldsets = (
        ('Статус', {
            'fields': ('status',)
        }),
        ('Суммы', {
            'fields': ('total_amount', 'delivery_price')
        }),
        ('Клиент', {
            'fields': ('user', 'customer_name', 'customer_phone', 'customer_email')
        }),
        ('Доставка', {
            'fields': (
                'delivery_type',
                'delivery_service',
                'delivery_city',
                'delivery_address_text',
                'pickup_point_data',
            )
        }),
        ('Комментарий', {
            'fields': ('comment',)
        }),
        ('Служебные', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    actions = ('set_status_new', 'set_status_paid', 'set_status_shipped', 'set_status_completed', 'set_status_canceled')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(_items_count=Count('items'))

    def items_count(self, obj):
        return getattr(obj, '_items_count', 0)

    items_count.short_description = 'Позиций'
    items_count.admin_order_field = '_items_count'

    def _set_status(self, request, queryset, status):
        queryset.update(status=status)

    def set_status_new(self, request, queryset):
        self._set_status(request, queryset, OrderStatus.NEW)

    set_status_new.short_description = 'Поставить статус: NEW'

    def set_status_paid(self, request, queryset):
        self._set_status(request, queryset, OrderStatus.PAID)

    set_status_paid.short_description = 'Поставить статус: PAID'

    def set_status_shipped(self, request, queryset):
        self._set_status(request, queryset, OrderStatus.SHIPPED)

    set_status_shipped.short_description = 'Поставить статус: SHIPPED'

    def set_status_completed(self, request, queryset):
        self._set_status(request, queryset, OrderStatus.COMPLETED)

    set_status_completed.short_description = 'Поставить статус: COMPLETED'

    def set_status_canceled(self, request, queryset):
        self._set_status(request, queryset, OrderStatus.CANCELED)

    set_status_canceled.short_description = 'Поставить статус: CANCELED'

    def has_delete_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return False

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)

        if request.user.is_superuser:
            return ro

        # Если хочешь другое имя группы — поменяй тут один раз
        if request.user.groups.filter(name='warehouse').exists():
            # Для сборщика: менять можно только status (и при желании comment).
            ro += [
                'user',
                'customer_name',
                'customer_phone',
                'customer_email',
                'delivery_type',
                'delivery_service',
                'delivery_city',
                'delivery_address_text',
                'pickup_point_data',
                'delivery_price',
                'comment',
            ]
            return ro

        return ro