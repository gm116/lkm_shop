import logging
import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PendingEmailChange, PendingRegistration
from .serializers import EmailChangeRequestSerializer, EmailChangeConfirmSerializer

logger = logging.getLogger(__name__)


def _make_verification_code():
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def _send_email_change_code(new_email, code):
    ttl_seconds = max(60, int(settings.EMAIL_VERIFICATION_CODE_TTL))
    ttl_minutes = max(1, ttl_seconds // 60)
    subject = 'Подтверждение смены email'
    message = (
        'Вы запросили смену email в личном кабинете ВсеЭмалиРу.\n\n'
        f'Код подтверждения: {code}\n'
        f'Код действует {ttl_minutes} мин.\n\n'
        'Если это были не вы, проигнорируйте письмо.'
    )
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[new_email],
        fail_silently=False,
    )


class EmailChangeRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EmailChangeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        new_email = serializer.validated_data['new_email']
        now = timezone.now()

        if not user.email:
            current_email = ''
        else:
            current_email = user.email.strip().lower()

        if new_email == current_email:
            return Response(
                {'detail': 'Укажите другой email'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists():
            return Response(
                {'detail': 'Этот email уже занят'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if PendingRegistration.objects.filter(email__iexact=new_email).exists():
            return Response(
                {'detail': 'Этот email сейчас ожидает подтверждения регистрации'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cooldown_seconds = max(0, int(settings.EMAIL_VERIFICATION_RESEND_COOLDOWN))
        ttl_seconds = max(60, int(settings.EMAIL_VERIFICATION_CODE_TTL))

        pending = PendingEmailChange.objects.filter(user=user).first()
        if pending and pending.new_email == new_email:
            available_at = pending.last_sent_at + timedelta(seconds=cooldown_seconds)
            if available_at > now:
                retry_after = int((available_at - now).total_seconds())
                return Response(
                    {
                        'detail': f'Повторную отправку можно запросить через {retry_after} сек.',
                        'retry_after': retry_after,
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        code = _make_verification_code()

        pending_obj, _ = PendingEmailChange.objects.update_or_create(
            user=user,
            defaults={
                'new_email': new_email,
                'code_hash': make_password(code),
                'code_expires_at': now + timedelta(seconds=ttl_seconds),
                'attempts': 0,
                'last_sent_at': now,
            },
        )

        try:
            _send_email_change_code(new_email, code)
        except Exception:
            pending_obj.delete()
            logger.exception('Не удалось отправить код смены email user_id=%s', user.id)
            return Response(
                {'detail': 'Не удалось отправить код. Попробуйте позже'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                'detail': 'Код подтверждения отправлен на новый email',
                'new_email': new_email,
                'expires_in': ttl_seconds,
                'retry_after': cooldown_seconds,
            },
            status=status.HTTP_200_OK,
        )


class EmailChangeConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EmailChangeConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        code = serializer.validated_data['code']
        now = timezone.now()
        max_attempts = max(1, int(settings.EMAIL_VERIFICATION_MAX_ATTEMPTS))

        pending = PendingEmailChange.objects.filter(user=user).first()
        if not pending:
            return Response(
                {'detail': 'Сначала запросите код подтверждения'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pending.code_expires_at < now:
            return Response(
                {'detail': 'Код истек. Запросите новый'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pending.attempts >= max_attempts:
            return Response(
                {'detail': 'Превышено число попыток. Запросите новый код'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not check_password(code, pending.code_hash):
            pending.attempts += 1
            pending.save(update_fields=['attempts', 'updated_at'])
            left_attempts = max(0, max_attempts - pending.attempts)
            if left_attempts <= 0:
                return Response(
                    {'detail': 'Превышено число попыток. Запросите новый код'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'detail': f'Неверный код. Осталось попыток: {left_attempts}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            if User.objects.select_for_update().filter(email__iexact=pending.new_email).exclude(id=user.id).exists():
                pending.delete()
                return Response(
                    {'detail': 'Этот email уже занят'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.email = pending.new_email
            user.save(update_fields=['email'])
            pending.delete()

        return Response(
            {
                'detail': 'Email успешно обновлен',
                'email': user.email,
            },
            status=status.HTTP_200_OK,
        )
