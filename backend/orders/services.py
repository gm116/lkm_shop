from django.db import transaction
from django.utils import timezone

from catalog.models import Product
from .models import Order, OrderStatus


class OrderCancellationError(Exception):
    pass


def _restore_order_stock(order: Order) -> None:
    items = list(
        order.items
        .select_for_update()
        .order_by('id')
    )
    product_ids = [item.product_id for item in items if item.product_id]
    locked_products = {
        product.id: product
        for product in Product.objects.select_for_update().filter(id__in=product_ids)
    }
    touched_products = []

    for item in items:
        product = locked_products.get(item.product_id)
        if not product:
            continue
        product.stock += item.quantity
        touched_products.append(product)

    if touched_products:
        Product.objects.bulk_update(touched_products, ['stock'])


def cancel_order(order: Order) -> Order:
    from payments.models import Payment

    with transaction.atomic():
        locked_order = Order.objects.select_for_update().get(pk=order.pk)

        if locked_order.status == OrderStatus.CANCELED:
            return locked_order

        if locked_order.status == OrderStatus.COMPLETED:
            raise OrderCancellationError('Завершенный заказ нельзя отменить')

        has_success_payment = Payment.objects.filter(
            order=locked_order,
            status=Payment.Status.SUCCEEDED,
        ).exists()

        if locked_order.status == OrderStatus.NEW and not has_success_payment:
            _restore_order_stock(locked_order)

        locked_order.status = OrderStatus.CANCELED
        if hasattr(locked_order, 'is_paid'):
            locked_order.is_paid = False

        locked_order.save(
            update_fields=[f for f in ['status', 'is_paid', 'updated_at'] if hasattr(locked_order, f)]
        )

        Payment.objects.filter(
            order=locked_order,
            status__in=[Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE],
        ).update(status=Payment.Status.CANCELED, updated_at=timezone.now())

        return locked_order
