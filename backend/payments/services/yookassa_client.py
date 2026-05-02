import uuid
import json
from decimal import Decimal

import os
from django.conf import settings

from yookassa import Configuration, Payment as YooPayment

def _as_dict(x):
    # yookassa Payment.json() обычно возвращает str (JSON)
    if x is None:
        return {}
    if isinstance(x, dict):
        return x
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return {}
    try:
        return dict(x)
    except Exception:
        return {}

def _cfg():
    Configuration.account_id = getattr(settings, 'YOOKASSA_ACCOUNT_ID', '') or os.getenv('YOOKASSA_ACCOUNT_ID')
    Configuration.secret_key = getattr(settings, 'YOOKASSA_SECRET_KEY', '') or os.getenv('YOOKASSA_SECRET_KEY')


def _money(value: Decimal) -> str:
    return f'{Decimal(value):.2f}'


def _build_receipt(*, customer_email: str, items: list[dict]) -> dict:
    email = (customer_email or '').strip()
    if not email:
        raise RuntimeError('Для формирования чека YooKassa нужен email покупателя')

    vat_code = getattr(settings, 'YOOKASSA_RECEIPT_VAT_CODE', '1') or '1'
    payment_mode = getattr(settings, 'YOOKASSA_RECEIPT_PAYMENT_MODE', 'full_payment') or 'full_payment'
    payment_subject = getattr(settings, 'YOOKASSA_RECEIPT_PAYMENT_SUBJECT', 'commodity') or 'commodity'

    receipt_items = []
    for item in items:
        quantity = int(item.get('quantity') or 0)
        amount_value = Decimal(item.get('amount_value') or 0)
        if quantity <= 0 or amount_value <= 0:
            continue

        description = (item.get('description') or 'Товар').strip()[:128]
        receipt_items.append({
            'description': description,
            'quantity': quantity,
            'amount': {'value': _money(amount_value), 'currency': 'RUB'},
            'vat_code': item.get('vat_code') or vat_code,
            'payment_mode': item.get('payment_mode') or payment_mode,
            'payment_subject': item.get('payment_subject') or payment_subject,
        })

    if not receipt_items:
        raise RuntimeError('Для формирования чека YooKassa нужны позиции заказа')

    return {
        'customer': {'email': email},
        'items': receipt_items,
    }


def create_payment_for_order(
    *,
    order_id: int,
    amount_value: Decimal,
    description: str,
    return_url: str,
    customer_email: str,
    receipt_items: list[dict],
):
    _cfg()
    if not Configuration.account_id or not Configuration.secret_key:
        raise RuntimeError('YOOKASSA credentials are not set')

    idempotence_key = uuid.uuid4().hex

    payload = {
        "amount": {"value": f"{amount_value:.2f}", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": description,
        "metadata": {"order_id": str(order_id)},
        "receipt": _build_receipt(customer_email=customer_email, items=receipt_items),
    }

    ypay = YooPayment.create(payload, idempotence_key)
    raw = ypay.json()  # <- это str
    data = _as_dict(raw)

    provider_payment_id = data.get("id", "")
    status = data.get("status", "pending")
    confirmation_url = (data.get("confirmation") or {}).get("confirmation_url", "") or ""

    return {
        "idempotence_key": idempotence_key,
        "provider_payment_id": provider_payment_id,
        "status": status,
        "confirmation_url": confirmation_url,
        "raw": data,
    }


def fetch_payment(provider_payment_id: str):
    _cfg()
    ypay = YooPayment.find_one(provider_payment_id)
    raw = ypay.json() if hasattr(ypay, "json") else ypay
    return _as_dict(raw)
