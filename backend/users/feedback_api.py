import logging

from django.conf import settings
from django.core.mail import EmailMessage
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView


logger = logging.getLogger(__name__)


class FeedbackSendSerializer(serializers.Serializer):
    email = serializers.EmailField()
    subject = serializers.CharField(max_length=180)
    message = serializers.CharField(max_length=4000)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_subject(self, value):
        text = str(value or '').strip()
        if len(text) < 4:
            raise serializers.ValidationError('Уточните тему обращения (минимум 4 символа)')
        return text

    def validate_message(self, value):
        text = str(value or '').strip()
        if len(text) < 10:
            raise serializers.ValidationError('Опишите обращение подробнее (минимум 10 символов)')
        return text

    def validate_name(self, value):
        return str(value or '').strip()

    def validate_phone(self, value):
        return str(value or '').strip()


class FeedbackSendView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'feedback_send'

    def post(self, request):
        serializer = FeedbackSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        recipient = (settings.FEEDBACK_TO_EMAIL or '').strip()
        if not recipient:
            logger.error('FEEDBACK_TO_EMAIL is empty. Feedback message was not sent')
            return Response(
                {'detail': 'Обратная связь временно недоступна'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        customer_name = data.get('name') or 'Не указано'
        customer_phone = data.get('phone') or 'Не указан'
        customer_email = data['email']
        customer_subject = data['subject']
        customer_message = data['message']

        full_subject = f'Обращение с сайта: {customer_subject}'
        body = (
            f'Тема: {customer_subject}\n'
            f'Имя: {customer_name}\n'
            f'Email: {customer_email}\n'
            f'Телефон: {customer_phone}\n\n'
            f'Сообщение:\n{customer_message}\n'
        )

        try:
            email_message = EmailMessage(
                subject=full_subject,
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[recipient],
                reply_to=[customer_email],
            )
            email_message.send(fail_silently=False)
        except Exception:
            logger.exception('Feedback email sending failed')
            return Response(
                {'detail': 'Не удалось отправить обращение. Попробуйте позже'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'detail': 'Обращение отправлено'}, status=status.HTTP_200_OK)
