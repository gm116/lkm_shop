from decimal import Decimal
import logging
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
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
from orders.services import cancel_order, OrderCancellationError
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


def _build_return_url(base_url: str, order_id: int) -> str:
    try:
        parsed = urlparse(base_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query['order_id'] = str(order_id)
        return urlunparse(parsed._replace(query=urlencode(query)))
    except Exception:
        sep = '&' if '?' in base_url else '?'
        return f'{base_url}{sep}order_id={order_id}'


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


def _sync_order_canceled(order: Order):
    return cancel_order(order)


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
        try:
            _sync_order_canceled(order)
        except OrderCancellationError:
            return


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
                return Response({"detail": "Недостаточно прав"}, status=status.HTTP_403_FORBIDDEN)

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

            return_url_base = getattr(settings, 'YOOKASSA_RETURN_URL', 'http://localhost:3000/checkout/success')
            return_url = _build_return_url(return_url_base, order.id)

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
            return Response({"detail": "Некорректные данные webhook"}, status=status.HTTP_400_BAD_REQUEST)

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
                    return Response({"detail": "Сумма платежа не совпадает"}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                pass
        if currency and currency != p.currency:
            return Response({"detail": "Валюта платежа не совпадает"}, status=status.HTTP_400_BAD_REQUEST)

        p.status = new_status
        p.raw = payload

        if new_status == Payment.Status.SUCCEEDED and p.paid_at is None:
            p.paid_at = timezone.now()

        p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

        if new_status == Payment.Status.SUCCEEDED:
            _sync_order_paid(p.order)

        if new_status == Payment.Status.CANCELED:
            try:
                _sync_order_canceled(p.order)
            except OrderCancellationError as exc:
                logger.warning(
                    "Webhook YooKassa: отмена заказа #%s отклонена: %s",
                    p.order_id,
                    str(exc),
                )

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
            return Response({"detail": "Недостаточно прав"}, status=status.HTTP_403_FORBIDDEN)

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
            try:
                _sync_order_canceled(p.order)
            except OrderCancellationError as exc:
                logger.warning(
                    "Sync YooKassa: отмена заказа #%s отклонена: %s",
                    p.order_id,
                    str(exc),
                )

        return Response({"status": p.status}, status=status.HTTP_200_OK)
