from decimal import Decimal
import logging
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.apps import apps

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication

from orders.models import OrderStatus
from catalog.models import Product
from .models import Payment
from .serializers import CreatePaymentSerializer
from .services.yookassa_client import create_payment_for_order, fetch_payment

Order = apps.get_model('orders', 'Order')
logger = logging.getLogger(__name__)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


def _order_description(order: Order) -> str:
    return f"Оплата заказа #{order.id}"


def _sync_order_paid(order: Order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if getattr(order, 'status', None) == OrderStatus.CANCELED:
            return
        if hasattr(order, 'status') and getattr(order, 'status', None) == OrderStatus.NEW:
            order.status = OrderStatus.PAID
        if hasattr(order, 'is_paid'):
            order.is_paid = True
        order.save(update_fields=[f for f in ['status', 'is_paid', 'updated_at'] if hasattr(order, f)])


def _restore_order_stock(order: Order):
    order = Order.objects.select_for_update().get(pk=order.pk)
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
    touched = []
    for item in items:
        product = locked_products.get(item.product_id)
        if not product:
            continue
        product.stock += item.quantity
        touched.append(product)
    if touched:
        Product.objects.bulk_update(touched, ['stock'])


def _cancel_open_payments(order: Order):
    Payment.objects.filter(
        order=order,
        status__in=[Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE],
    ).update(status=Payment.Status.CANCELED, updated_at=timezone.now())


def _sync_order_canceled(order: Order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if getattr(order, 'status', None) == OrderStatus.CANCELED:
            return
        current_status = getattr(order, 'status', None)
        if current_status == OrderStatus.NEW and not Payment.objects.filter(order=order, status=Payment.Status.SUCCEEDED).exists():
            _restore_order_stock(order)
        if hasattr(order, 'status'):
            order.status = OrderStatus.CANCELED
        if hasattr(order, 'is_paid'):
            order.is_paid = False
        order.save(update_fields=[f for f in ['status', 'is_paid', 'updated_at'] if hasattr(order, f)])
        _cancel_open_payments(order)


def _rollback_order_on_payment_creation_failure(order: Order):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if getattr(order, 'status', None) != OrderStatus.NEW:
            return
        if Payment.objects.filter(
            order=order,
            status__in=[
                Payment.Status.PENDING,
                Payment.Status.WAITING_FOR_CAPTURE,
                Payment.Status.SUCCEEDED,
            ],
        ).exists():
            return
        _sync_order_canceled(order)


class CreatePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = CreatePaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        order_id = ser.validated_data['order_id']
        with transaction.atomic():
            try:
                order = Order.objects.select_for_update().get(id=order_id)
            except Order.DoesNotExist:
                return Response({"detail": "Заказ не найден"}, status=status.HTTP_404_NOT_FOUND)

            # Если у тебя заказ привязан к пользователю — включи проверку:
            if hasattr(order, 'user_id') and order.user_id != request.user.id:
                return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

            if Payment.objects.filter(order=order, status=Payment.Status.SUCCEEDED).exists() or getattr(order, 'is_paid', False):
                return Response({"detail": "Заказ уже оплачен"}, status=status.HTTP_400_BAD_REQUEST)

            if getattr(order, 'status', '') == OrderStatus.CANCELED:
                return Response({"detail": "Заказ отменен"}, status=status.HTTP_400_BAD_REQUEST)

            # Защита от дублей: если есть активный payment, просто возвращаем ссылку
            existing = Payment.objects.filter(
                order=order,
                status__in=[Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE],
            ).order_by('-created_at').first()

            if existing and existing.confirmation_url:
                return Response({
                    "confirmation_url": existing.confirmation_url,
                    "payment_id": existing.provider_payment_id or str(existing.id),
                    "status": existing.status,
                }, status=status.HTTP_200_OK)

            amount = Decimal(getattr(order, 'total_amount', 0) or 0)
            if amount <= 0:
                return Response({"detail": "Некорректная сумма заказа"}, status=status.HTTP_400_BAD_REQUEST)

            return_url = getattr(settings, 'YOOKASSA_RETURN_URL', 'http://localhost:3000/checkout/success')

            try:
                r = create_payment_for_order(
                    order_id=order.id,
                    amount_value=amount,
                    description=_order_description(order),
                    return_url=return_url,
                )

                if not (r.get("confirmation_url") or ""):
                    raise RuntimeError('Не пришла ссылка на оплату')

                with transaction.atomic():
                    p = Payment.objects.create(
                        order=order,
                        amount_value=amount,
                        currency='RUB',
                        status=r["status"] or Payment.Status.PENDING,
                        provider_payment_id=r["provider_payment_id"] or "",
                        idempotence_key=r["idempotence_key"] or "",
                        confirmation_url=r["confirmation_url"] or "",
                        raw=r["raw"],
                    )
            except Exception as exc:
                _rollback_order_on_payment_creation_failure(order)
                return Response(
                    {"detail": str(exc) or "Не удалось сформировать платеж"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response({
                "confirmation_url": p.confirmation_url,
                "payment_id": p.provider_payment_id or str(p.id),
                "status": p.status,
            }, status=status.HTTP_201_CREATED)


class YooKassaWebhookView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = []

    @csrf_exempt
    def post(self, request):
        # ЮKassa шлёт event + object (payment)
        payload = request.data or {}
        event = payload.get("event") or ""
        obj = payload.get("object") or {}
        provider_payment_id = obj.get("id") or ""
        metadata = obj.get("metadata") or {}
        order_id_from_metadata = metadata.get("order_id") or ""

        if not provider_payment_id:
            logger.warning(
                "Webhook YooKassa: пустой payment_id, event=%s, order_id=%s",
                event,
                order_id_from_metadata,
            )
            return Response({"detail": "bad payload"}, status=status.HTTP_400_BAD_REQUEST)

        p = Payment.objects.filter(provider='yookassa', provider_payment_id=provider_payment_id).select_related('order').first()
        if not p:
            # Чтобы не падать на “ранний вебхук”, можно создать запись,
            # но мы не будем: просто 200 OK, чтобы ЮKassa не долбила ретраями.
            logger.info(
                "Webhook YooKassa: платеж не найден, event=%s, payment_id=%s, order_id=%s, status=%s",
                event,
                provider_payment_id,
                order_id_from_metadata,
                obj.get("status") or "",
            )
            return Response({"ok": True}, status=status.HTTP_200_OK)

        new_status = obj.get("status") or p.status

        # минимальная защита по сумме/валюте
        amount = (obj.get("amount") or {}).get("value")
        currency = (obj.get("amount") or {}).get("currency")
        if amount is not None:
            try:
                if Decimal(str(amount)) != p.amount_value:
                    return Response({"detail": "amount mismatch"}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                pass
        if currency and currency != p.currency:
            return Response({"detail": "currency mismatch"}, status=status.HTTP_400_BAD_REQUEST)

        p.status = new_status
        p.raw = payload

        if new_status == Payment.Status.SUCCEEDED and p.paid_at is None:
            p.paid_at = timezone.now()

        p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

        if new_status == Payment.Status.SUCCEEDED:
            _sync_order_paid(p.order)

        if new_status == Payment.Status.CANCELED:
            _sync_order_canceled(p.order)

        logger.info(
            "Webhook YooKassa: event=%s, payment_id=%s, order_id=%s, payment_status=%s, order_status=%s",
            event,
            provider_payment_id,
            p.order_id,
            new_status,
            getattr(p.order, 'status', ''),
        )

        return Response({"ok": True}, status=status.HTTP_200_OK)


class PaymentSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id: int):
        # ручная “дожималка” для фронта после return_url
        p = Payment.objects.filter(order_id=order_id).select_related('order').order_by('-created_at').first()
        if not p or not p.provider_payment_id:
            return Response({"detail": "Платёж не найден"}, status=status.HTTP_404_NOT_FOUND)

        if getattr(p.order, 'user_id', None) != request.user.id:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        data = fetch_payment(p.provider_payment_id)
        new_status = data.get("status") or p.status

        p.status = new_status
        p.raw = data
        if new_status == Payment.Status.SUCCEEDED and p.paid_at is None:
            p.paid_at = timezone.now()
        p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

        if new_status == Payment.Status.SUCCEEDED:
            _sync_order_paid(p.order)
        elif new_status == Payment.Status.CANCELED:
            _sync_order_canceled(p.order)

        return Response({"status": p.status}, status=status.HTTP_200_OK)
