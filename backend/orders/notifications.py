import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email

from .models import Order


logger = logging.getLogger(__name__)

STATUS_LABELS = {
    'new': 'Новый',
    'paid': 'Оплачен',
    'shipped': 'Передан в доставку',
    'completed': 'Доставлен',
    'canceled': 'Отменен',
}


def _status_label(status_key: str) -> str:
    return STATUS_LABELS.get(status_key, status_key or 'Не указан')


def send_order_status_email(order: Order, previous_status: str | None = None) -> tuple[bool, str | None]:
    email = (order.customer_email or '').strip()
    if not email:
        return False, 'email_missing'

    try:
        validate_email(email)
    except ValidationError:
        return False, 'email_invalid'

    current_status = _status_label(order.status)
    previous_label = _status_label(previous_status) if previous_status else None

    subject = f'Статус заказа #{order.id} изменен'
    lines = [
        f'Здравствуйте, {order.customer_name or "покупатель"}!',
        '',
        f'Статус вашего заказа №{order.id} обновлен.',
    ]
    if previous_label:
        lines.append(f'Было: {previous_label}')
    lines.extend([
        f'Текущий статус: {current_status}',
        '',
        f'Сумма заказа: {order.total_amount} ₽',
        'Если у вас есть вопросы, ответьте на это письмо или свяжитесь с магазином.',
    ])
    message = '\n'.join(lines)

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            'Не удалось отправить уведомление о смене статуса заказа order_id=%s email=%s',
            order.id,
            email,
        )
        return False, 'send_failed'

    return True, None
