from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from payments.models import Payment
from payments.services.yookassa_client import fetch_payment
from payments.views import _sync_order_paid, _sync_order_canceled

class Command(BaseCommand):
    help = "Reconcile pending YooKassa payments"

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=24)

        qs = Payment.objects.filter(
            provider='yookassa',
            status__in=[Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE],
            created_at__gte=cutoff,
        ).order_by('-created_at')[:200]

        for p in qs:
            if not p.provider_payment_id:
                continue

            data = fetch_payment(p.provider_payment_id)
            new_status = data.get("status") or p.status

            if new_status != p.status:
                p.status = new_status
                p.raw = data
                if new_status == Payment.Status.SUCCEEDED and p.paid_at is None:
                    p.paid_at = timezone.now()
                p.save(update_fields=['status', 'raw', 'paid_at', 'updated_at'])

            if p.status == Payment.Status.SUCCEEDED:
                _sync_order_paid(p.order)
            elif p.status == Payment.Status.CANCELED:
                _sync_order_canceled(p.order)

        self.stdout.write(self.style.SUCCESS("OK"))
