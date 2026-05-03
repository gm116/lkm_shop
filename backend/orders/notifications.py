import logging
from html import escape

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives, send_mail
from django.core.validators import validate_email

from .models import DeliveryType, Order


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


def _order_number(order: Order) -> str:
    return order.order_number


def _money(value) -> str:
    return f'{value:.2f} ₽'


def _delivery_label(order: Order) -> str:
    labels = {
        DeliveryType.STORE_PICKUP: 'Самовывоз',
        DeliveryType.PVZ: 'Доставка до ПВЗ',
        DeliveryType.COURIER: 'Курьерская доставка',
    }
    return labels.get(order.delivery_type, order.delivery_type or 'Не указан')


def _order_link(order: Order) -> str:
    frontend_url = (getattr(settings, 'FRONTEND_URL', '') or '').rstrip('/')
    if not frontend_url:
        return ''
    return f'{frontend_url}/profile'


def _build_paid_email_plain(order: Order) -> str:
    lines = [
        f'Здравствуйте, {order.customer_name or "покупатель"}!',
        '',
        f'Заказ №{_order_number(order)} оплачен. Мы получили оплату и передали заказ в обработку.',
        '',
        'Состав заказа:',
    ]

    for item in order.items.all():
        line_total = item.price_snapshot * item.quantity
        lines.append(
            f'- {item.product_name_snapshot}: {item.quantity} x {_money(item.price_snapshot)} = {_money(line_total)}'
        )

    if order.delivery_price:
        lines.append(f'- Доставка: {_money(order.delivery_price)}')

    lines.extend([
        '',
        f'Способ получения: {_delivery_label(order)}',
        f'Итого: {_money(order.total_amount)}',
    ])

    if order.delivery_city:
        lines.append(f'Город: {order.delivery_city}')
    if order.delivery_address_text:
        lines.append(f'Адрес: {order.delivery_address_text}')

    order_url = _order_link(order)
    if order_url:
        lines.extend(['', f'Заказ можно посмотреть в личном кабинете: {order_url}'])

    lines.extend([
        '',
        'Фискальный чек направляется отдельно платежным сервисом YooKassa.',
        'Если у вас есть вопросы, ответьте на это письмо.',
    ])
    return '\n'.join(lines)


def _build_paid_email_html(order: Order) -> str:
    rows = []
    for item in order.items.all():
        line_total = item.price_snapshot * item.quantity
        rows.append(f'''
            <tr>
                <td style="padding:14px 0;border-bottom:1px solid #e8e2d8;color:#1d1d1b;">
                    <div style="font-size:15px;font-weight:700;line-height:1.35;">{escape(item.product_name_snapshot)}</div>
                    <div style="margin-top:4px;color:#7a7369;font-size:13px;">{item.quantity} шт. x {_money(item.price_snapshot)}</div>
                </td>
                <td style="padding:14px 0;border-bottom:1px solid #e8e2d8;text-align:right;color:#1d1d1b;font-size:15px;font-weight:700;white-space:nowrap;">
                    {_money(line_total)}
                </td>
            </tr>
        ''')

    delivery_row = ''
    if order.delivery_price:
        delivery_row = f'''
            <tr>
                <td style="padding:14px 0;border-bottom:1px solid #e8e2d8;color:#1d1d1b;font-size:15px;">Доставка</td>
                <td style="padding:14px 0;border-bottom:1px solid #e8e2d8;text-align:right;color:#1d1d1b;font-size:15px;font-weight:700;white-space:nowrap;">
                    {_money(order.delivery_price)}
                </td>
            </tr>
        '''

    order_url = _order_link(order)
    action_html = ''
    if order_url:
        action_html = f'''
            <div style="margin-top:24px;">
                <a href="{escape(order_url)}" style="display:inline-block;padding:13px 18px;background:#1d1d1b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:700;">
                    Открыть личный кабинет
                </a>
            </div>
        '''

    delivery_details = [
        f'<strong>Способ получения:</strong> {escape(_delivery_label(order))}',
    ]
    if order.delivery_city:
        delivery_details.append(f'<strong>Город:</strong> {escape(order.delivery_city)}')
    if order.delivery_address_text:
        delivery_details.append(f'<strong>Адрес:</strong> {escape(order.delivery_address_text)}')

    delivery_html = '<br>'.join(delivery_details)

    order_number = _order_number(order)

    return f'''<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b;">
    <div style="display:none;max-height:0;overflow:hidden;">Заказ №{order_number} оплачен и передан в обработку.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:28px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e2d8;">
                    <tr>
                        <td style="padding:28px 32px 20px;background:#1d1d1b;color:#ffffff;">
                            <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#cdbb9e;">ЛКМ. Интернет-магазин</div>
                            <div style="margin-top:10px;font-size:28px;line-height:1.2;font-weight:700;">Заказ №{order_number} оплачен</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="margin:0;color:#1d1d1b;font-size:16px;line-height:1.55;">
                                Здравствуйте, {escape(order.customer_name or 'покупатель')}! Мы получили оплату и передали заказ в обработку.
                            </p>

                            <div style="margin-top:24px;padding:16px 18px;background:#f7f3ed;border:1px solid #e8e2d8;border-radius:6px;color:#4f473e;font-size:14px;line-height:1.6;">
                                {delivery_html}
                            </div>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;">
                                {''.join(rows)}
                                {delivery_row}
                                <tr>
                                    <td style="padding:18px 0 0;color:#1d1d1b;font-size:18px;font-weight:700;">Итого</td>
                                    <td style="padding:18px 0 0;text-align:right;color:#1d1d1b;font-size:22px;font-weight:700;white-space:nowrap;">{_money(order.total_amount)}</td>
                                </tr>
                            </table>

                            {action_html}

                            <p style="margin:24px 0 0;color:#7a7369;font-size:13px;line-height:1.55;">
                                Фискальный чек направляется отдельно платежным сервисом YooKassa.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>'''


def send_order_paid_email(order: Order) -> tuple[bool, str | None]:
    email = (order.customer_email or '').strip()
    if not email:
        return False, 'email_missing'

    try:
        validate_email(email)
    except ValidationError:
        return False, 'email_invalid'

    subject = f'Заказ №{_order_number(order)} оплачен'
    text_body = _build_paid_email_plain(order)
    html_body = _build_paid_email_html(order)

    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        message.attach_alternative(html_body, 'text/html')
        message.send(fail_silently=False)
    except Exception:
        logger.exception(
            'Не удалось отправить письмо об оплате заказа order_id=%s email=%s',
            order.id,
            email,
        )
        return False, 'send_failed'

    return True, None


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

    subject = f'Статус заказа №{_order_number(order)} изменен'
    lines = [
        f'Здравствуйте, {order.customer_name or "покупатель"}!',
        '',
        f'Статус вашего заказа №{_order_number(order)} обновлен.',
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
