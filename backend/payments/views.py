from decimal import Decimal
import logging
import ipaddress
import hashlib
import json
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
from orders.notifications import send_order_paid_email
from orders.services import cancel_order, OrderCancellationError
from .models import Payment, PaymentWebhookEvent
from .serializers import CreatePaymentSerializer
from .services.yookassa_client import create_payment_for_order, fetch_payment

Order = apps.get_model('orders', 'Order')
logger = logging.getLogger(__name__)

ALLOWED_YOOKASSA_STATUSES = {
    Payment.Status.PENDING,
    Payment.Status.WAITING_FOR_CAPTURE,
    Payment.Status.SUCCEEDED,
    Payment.Status.CANCELED,
}
TERMINAL_PAYMENT_STATUSES = {
    Payment.Status.SUCCEEDED,
    Payment.Status.CANCELED,
    Payment.Status.FAILED,
}


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


def _claim_paid_email_order(payment_id):
    with transaction.atomic():
        payment = (
            Payment.objects
            .select_for_update()
            .select_related('order')
            .prefetch_related('order__items')
            .get(pk=payment_id)
        )
        if payment.paid_email_sent_at is not None:
            return None
        payment.paid_email_sent_at = timezone.now()
        payment.save(update_fields=['paid_email_sent_at', 'updated_at'])
        return payment.order


def _send_paid_email_once(payment: Payment):
    try:
        order = _claim_paid_email_order(payment.pk)
    except Payment.DoesNotExist:
        return
    if order is None:
        return
    order.refresh_from_db()
    send_order_paid_email(order)


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


def _get_webhook_client_ip(request) -> str:
    if getattr(settings, 'YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR', False):
        xff = (request.META.get('HTTP_X_FORWARDED_FOR') or '').strip()
        if xff:
            return xff.split(',')[0].strip()
        x_real_ip = (request.META.get('HTTP_X_REAL_IP') or '').strip()
        if x_real_ip:
            return x_real_ip
    return (request.META.get('REMOTE_ADDR') or '').strip()


def _is_webhook_ip_allowed(request) -> tuple[bool, str]:
    allowed_pool = getattr(settings, 'YOOKASSA_WEBHOOK_ALLOWED_IPS', tuple()) or tuple()
    client_ip = _get_webhook_client_ip(request)
    enforce_pool = bool(getattr(settings, 'YOOKASSA_WEBHOOK_ENFORCE_IP_WHITELIST', False))

    if not allowed_pool:
        return (not enforce_pool), client_ip

    if not client_ip:
        return False, client_ip

    try:
        ip_obj = ipaddress.ip_address(client_ip)
    except ValueError:
        return False, client_ip

    for net in allowed_pool:
        if ip_obj in net:
            return True, client_ip

    return False, client_ip


def _payload_hash(payload: dict) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def _register_webhook_event(payload: dict, event_type: str, payment_id: str, payment_status: str) -> bool:
    event_hash = _payload_hash(payload)
    _, created = PaymentWebhookEvent.objects.get_or_create(
        payload_hash=event_hash,
        defaults={
            'provider': Payment.Provider.YOOKASSA,
            'event_type': event_type,
            'provider_payment_id': payment_id,
            'payment_status': payment_status or '',
            'raw': payload,
        },
    )
    return created


def _is_event_status_consistent(event_type: str, payment_status: str) -> bool:
    if not event_type or not event_type.startswith('payment.'):
        return False
    expected_status = event_type.split('.', 1)[1].strip()
    return bool(expected_status) and expected_status == (payment_status or '').strip()


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

            return_url_base = getattr(settings, 'YOOKASSA_RETURN_URL', '')
            if not return_url_base:
                return Response(
                    {"detail": "Не настроен YOOKASSA_RETURN_URL"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return_url = _build_return_url(return_url_base, order.id)
            receipt_items = [
                {
                    'description': item.product_name_snapshot,
                    'quantity': item.quantity,
                    'amount_value': item.price_snapshot,
                }
                for item in order.items.all()
            ]
            if Decimal(order.delivery_price or 0) > 0:
                receipt_items.append({
                    'description': 'Доставка',
                    'quantity': 1,
                    'amount_value': order.delivery_price,
                    'payment_subject': 'service',
                })

            try:
                r = create_payment_for_order(
                    order_id=order.id,
                    amount_value=amount,
                    description=_order_description(order),
                    return_url=return_url,
                    customer_email=order.customer_email,
                    receipt_items=receipt_items,
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
        allowed, client_ip = _is_webhook_ip_allowed(request)
        if not allowed:
            logger.warning(
                "Webhook YooKassa: IP не разрешен, ip=%s, xff=%s",
                client_ip or '<empty>',
                request.META.get('HTTP_X_FORWARDED_FOR') or '',
            )
            return Response({"detail": "IP не разрешен"}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data or {}
        event = payload.get("event") or ""
        obj = payload.get("object") or {}
        provider_payment_id = obj.get("id") or ""
        new_status = obj.get("status") or ""
        metadata = obj.get("metadata") or {}
        order_id_from_metadata = metadata.get("order_id") or ""

        if not isinstance(payload, dict) or not isinstance(obj, dict):
            logger.warning("Webhook YooKassa: некорректная структура payload")
            return Response({"detail": "Некорректные данные webhook"}, status=status.HTTP_400_BAD_REQUEST)

        if not provider_payment_id:
            logger.warning(
                "Webhook YooKassa: пустой payment_id, event=%s, order_id=%s",
                event,
                order_id_from_metadata,
            )
            return Response({"detail": "Некорректные данные webhook"}, status=status.HTTP_400_BAD_REQUEST)

        if new_status not in ALLOWED_YOOKASSA_STATUSES:
            logger.warning(
                "Webhook YooKassa: неизвестный статус, event=%s, payment_id=%s, status=%s",
                event,
                provider_payment_id,
                new_status,
            )
            return Response({"detail": "Неизвестный статус платежа"}, status=status.HTTP_400_BAD_REQUEST)

        if not _is_event_status_consistent(event, new_status):
            logger.warning(
                "Webhook YooKassa: несоответствие event/status, event=%s, payment_id=%s, status=%s",
                event,
                provider_payment_id,
                new_status,
            )
            return Response({"detail": "Неконсистентные данные webhook"}, status=status.HTTP_400_BAD_REQUEST)

        is_first_event = _register_webhook_event(payload, event, provider_payment_id, new_status)
        if not is_first_event:
            logger.info(
                "Webhook YooKassa: дубликат payload, event=%s, payment_id=%s",
                event,
                provider_payment_id,
            )
            return Response({"ok": True}, status=status.HTTP_200_OK)

        p = Payment.objects.filter(provider='yookassa', provider_payment_id=provider_payment_id).select_related('order').first()
        if not p:
            logger.info(
                "Webhook YooKassa: платеж не найден, event=%s, payment_id=%s, order_id=%s, status=%s",
                event,
                provider_payment_id,
                order_id_from_metadata,
                obj.get("status") or "",
            )
            return Response({"ok": True}, status=status.HTTP_200_OK)

        try:
            provider_data = fetch_payment(provider_payment_id)
        except Exception:
            logger.exception(
                "Webhook YooKassa: ошибка запроса к API для верификации payment_id=%s",
                provider_payment_id,
            )
            return Response(
                {"detail": "Не удалось верифицировать webhook"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        api_status = (provider_data or {}).get("status") or ""
        if api_status not in ALLOWED_YOOKASSA_STATUSES:
            logger.warning(
                "Webhook YooKassa: API вернул неизвестный статус, payment_id=%s, api_status=%s",
                provider_payment_id,
                api_status,
            )
            return Response({"detail": "Некорректный статус из API"}, status=status.HTTP_400_BAD_REQUEST)

        if api_status != new_status:
            logger.warning(
                "Webhook YooKassa: статус payload не совпал с API, payment_id=%s, payload_status=%s, api_status=%s",
                provider_payment_id,
                new_status,
                api_status,
            )
            return Response({"detail": "Статус платежа не подтвержден API"}, status=status.HTTP_409_CONFLICT)

        amount = (provider_data.get("amount") or {}).get("value")
        currency = (provider_data.get("amount") or {}).get("currency")
        if amount is not None:
            try:
                if Decimal(str(amount)) != p.amount_value:
                    return Response({"detail": "Сумма платежа не совпадает"}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                pass
        if currency and currency != p.currency:
            return Response({"detail": "Валюта платежа не совпадает"}, status=status.HTTP_400_BAD_REQUEST)

        provider_metadata = provider_data.get("metadata") or {}
        provider_order_id = str(provider_metadata.get("order_id") or '').strip()
        if provider_order_id and provider_order_id != str(p.order_id):
            logger.warning(
                "Webhook YooKassa: order_id в metadata не совпал, payment_id=%s, expected_order=%s, got_order=%s",
                provider_payment_id,
                p.order_id,
                provider_order_id,
            )
            return Response({"detail": "order_id не совпадает"}, status=status.HTTP_400_BAD_REQUEST)

        if p.status in TERMINAL_PAYMENT_STATUSES and new_status != p.status:
            logger.warning(
                "Webhook YooKassa: попытка изменить финальный статус, payment_id=%s, current=%s, incoming=%s",
                provider_payment_id,
                p.status,
                new_status,
            )
            return Response({"ok": True}, status=status.HTTP_200_OK)

        p.status = new_status
        p.raw = payload

        should_set_paid_at = new_status == Payment.Status.SUCCEEDED and p.paid_at is None
        if should_set_paid_at:
            p.paid_at = timezone.now()

        p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

        if new_status == Payment.Status.SUCCEEDED:
            _sync_order_paid(p.order)
            _send_paid_email_once(p)

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
        p = Payment.objects.filter(order_id=order_id).select_related('order').order_by('-created_at').first()
        if not p or not p.provider_payment_id:
            return Response({"detail": "Платёж не найден"}, status=status.HTTP_404_NOT_FOUND)

        if getattr(p.order, 'user_id', None) != request.user.id:
            return Response({"detail": "Недостаточно прав"}, status=status.HTTP_403_FORBIDDEN)

        data = fetch_payment(p.provider_payment_id)
        new_status = data.get("status") or p.status

        p.status = new_status
        p.raw = data
        should_set_paid_at = new_status == Payment.Status.SUCCEEDED and p.paid_at is None
        if should_set_paid_at:
            p.paid_at = timezone.now()
        p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

        if new_status == Payment.Status.SUCCEEDED:
            _sync_order_paid(p.order)
            _send_paid_email_once(p)
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
