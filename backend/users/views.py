import logging
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils import timezone
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework.permissions import IsAuthenticated

from .serializers import PasswordResetRequestSerializer, PasswordResetConfirmSerializer

logger = logging.getLogger(__name__)


def set_refresh_cookie(response, token):
    response.set_cookie(
        key='refresh_token',
        value=str(token),
        httponly=True,
        secure=False,
        samesite='Lax',
        path='/',
    )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        identifier = (request.data.get('username') or request.data.get('email') or '').strip()
        password = request.data.get('password') or ''

        if not identifier or not password:
            return Response({'detail': 'Введите email или логин и пароль'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=identifier).first()
        if not user:
            user = User.objects.filter(username__iexact=identifier).first()

        if not user or not user.check_password(password):
            return Response({'detail': 'Неверный логин или пароль'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response({'detail': 'Аккаунт деактивирован'}, status=status.HTTP_403_FORBIDDEN)

        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        refresh = RefreshToken.for_user(user)

        response = Response({
            'access': str(refresh.access_token),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            }
        }, status=status.HTTP_200_OK)

        set_refresh_cookie(response, refresh)
        return response


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        user = User.objects.filter(email__iexact=email).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password/{uid}/{token}"
            message = (
                "Вы запросили восстановление пароля.\n\n"
                "Перейдите по ссылке, чтобы задать новый пароль:\n"
                f"{reset_url}\n\n"
                "Если вы не запрашивали смену пароля, просто проигнорируйте это письмо."
            )
            try:
                send_mail(
                    subject='Сброс пароля',
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            except Exception:
                # Не раскрываем на клиенте проблемы почты и не ломаем UX.
                logger.exception("Не удалось отправить письмо для сброса пароля user_id=%s", user.id)

        return Response(
            {'detail': 'Если такой email зарегистрирован, мы отправили ссылку для восстановления'},
            status=status.HTTP_200_OK
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uidb64 = serializer.validated_data.get('uid')
        token = serializer.validated_data.get('token')

        user = None
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.filter(pk=uid).first()
        except Exception:
            user = None

        if not user or not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Ссылка для сброса пароля недействительна или устарела'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer.set_user(user)
        serializer.save()

        return Response({'detail': 'Пароль обновлён'}, status=status.HTTP_200_OK)


class PasswordResetValidateView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')

        if not uidb64 or not token:
            return Response(
                {'detail': 'Ссылка для сброса пароля недействительна или устарела'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = None
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.filter(pk=uid).first()
        except Exception:
            user = None

        if not user or not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Ссылка для сброса пароля недействительна или устарела'},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({'valid': True}, status=status.HTTP_200_OK)


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.COOKIES.get('refresh_token')
        if not token:
            return Response({'detail': 'Токен обновления не найден'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(token)
            access = refresh.access_token

            response = Response({'access': str(access)}, status=status.HTTP_200_OK)
            set_refresh_cookie(response, refresh)
            return response
        except InvalidToken:
            return Response({'detail': 'Недействительный токен обновления'}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    def post(self, request):
        response = Response({'detail': 'Вы вышли из аккаунта'}, status=status.HTTP_200_OK)
        response.delete_cookie('refresh_token')
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({
            'username': u.username,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
        })

    def patch(self, request):
        u = request.user

        email = (request.data.get('email') or '').strip()
        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()

        if email and email.lower() != (u.email or '').strip().lower():
            try:
                validate_email(email)
            except DjangoValidationError:
                return Response({'detail': 'Введите корректный email'}, status=status.HTTP_400_BAD_REQUEST)
            return Response(
                {'detail': 'Смена email выполняется через подтверждение кода'},
                status=status.HTTP_400_BAD_REQUEST
            )

        u.first_name = first_name
        u.last_name = last_name
        u.save(update_fields=['first_name', 'last_name'])

        return Response({
            'username': u.username,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
        }, status=status.HTTP_200_OK)


class MePermissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        groups = list(user.groups.values_list('name', flat=True))

        return Response({
            'is_staff': bool(user.is_staff),
            'is_superuser': bool(user.is_superuser),
            'groups': groups,
        })
