import logging
import random
import re
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
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PendingRegistration
from .serializers import RegistrationRequestCodeSerializer, RegistrationConfirmCodeSerializer

logger = logging.getLogger(__name__)


def set_refresh_cookie(response, token):
    response.set_cookie(
        key='refresh_token',
        value=str(token),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def _make_verification_code():
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def _build_username_from_email(email):
    base = (email or '').split('@', 1)[0].strip().lower()
    base = re.sub(r'[^a-z0-9._-]+', '_', base)
    base = base.strip('._-') or 'user'
    base = base[:130]

    candidate = base
    index = 1
    while User.objects.filter(username__iexact=candidate).exists():
        suffix = f"_{index}"
        candidate = f"{base[:150 - len(suffix)]}{suffix}"
        index += 1

    return candidate


def _cleanup_old_pending(now):
    retention_seconds = max(600, int(settings.EMAIL_VERIFICATION_PENDING_RETENTION))
    threshold = now - timedelta(seconds=retention_seconds)
    PendingRegistration.objects.filter(updated_at__lt=threshold).delete()


def _send_registration_code(email, code):
    ttl_seconds = max(60, int(settings.EMAIL_VERIFICATION_CODE_TTL))
    ttl_minutes = max(1, ttl_seconds // 60)
    subject = 'Код подтверждения email'
    message = (
        'Вы начали регистрацию в магазине ВсеЭмалиРу.\n\n'
        f'Код подтверждения: {code}\n'
        f'Код действует {ttl_minutes} мин.\n\n'
        'Если это были не вы, просто проигнорируйте это письмо.'
    )
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )


class RegistrationRequestCodeView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegistrationRequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        now = timezone.now()

        _cleanup_old_pending(now)

        cooldown_seconds = max(0, int(settings.EMAIL_VERIFICATION_RESEND_COOLDOWN))
        ttl_seconds = max(60, int(settings.EMAIL_VERIFICATION_CODE_TTL))

        pending = PendingRegistration.objects.filter(email=email).first()
        if pending:
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

        pending_obj, _ = PendingRegistration.objects.update_or_create(
            email=email,
            defaults={
                'password_hash': make_password(password),
                'code_hash': make_password(code),
                'code_expires_at': now + timedelta(seconds=ttl_seconds),
                'attempts': 0,
                'last_sent_at': now,
            },
        )

        try:
            _send_registration_code(email, code)
        except Exception:
            pending_obj.delete()
            logger.exception('Не удалось отправить код подтверждения email=%s', email)
            return Response(
                {'detail': 'Не удалось отправить код. Попробуйте позже'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                'detail': 'Код подтверждения отправлен на email',
                'email': email,
                'expires_in': ttl_seconds,
                'retry_after': cooldown_seconds,
            },
            status=status.HTTP_200_OK,
        )


class RegistrationConfirmCodeView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegistrationConfirmCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        code = serializer.validated_data['code']
        now = timezone.now()
        max_attempts = max(1, int(settings.EMAIL_VERIFICATION_MAX_ATTEMPTS))

        pending = PendingRegistration.objects.filter(email=email).first()
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
            if User.objects.select_for_update().filter(email__iexact=email).exists():
                pending.delete()
                return Response(
                    {'detail': 'Этот email уже занят'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            username = _build_username_from_email(email)
            user = User(
                username=username,
                email=email,
                password=pending.password_hash,
                is_active=True,
            )
            user.save()

            pending.delete()

        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                'access': str(refresh.access_token),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                },
            },
            status=status.HTTP_201_CREATED,
        )
        set_refresh_cookie(response, refresh)
        return response
