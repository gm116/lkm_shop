from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


def translate_password_error(message):
    text = str(message or '').strip()
    lower = text.lower()

    if 'too similar to the username' in lower:
        return 'Пароль слишком похож на логин'
    if 'too similar to the email' in lower:
        return 'Пароль слишком похож на email'
    if 'too short' in lower:
        return 'Пароль слишком короткий'
    if 'too common' in lower:
        return 'Пароль слишком простой'
    if 'entirely numeric' in lower:
        return 'Пароль не должен состоять только из цифр'
    if 'this password is too similar' in lower:
        return 'Пароль слишком похож на личные данные'

    return text or 'Некорректный пароль'


def translate_password_errors(messages):
    return [translate_password_error(message) for message in messages]


def first_password_error(messages):
    translated = translate_password_errors(messages)
    return translated[0] if translated else 'Некорректный пароль'


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def validate_username(self, value):
        username = (value or '').strip()
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError('Этот логин уже занят')
        return username

    def validate_email(self, value):
        email = (value or '').strip()
        if email and User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Этот email уже занят')
        return email

    def validate_password(self, value):
        username = (self.initial_data.get('username') or '').strip()
        email = (self.initial_data.get('email') or '').strip()
        candidate_user = User(username=username, email=email)
        try:
            validate_password(value, user=candidate_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(first_password_error(e.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'].strip(),
            email=validated_data.get('email', '').strip(),
            password=validated_data['password'],
        )


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate(self, attrs):
        email = (attrs.get('email') or '').strip()
        attrs['email'] = email
        return attrs


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)
    user = None

    default_error_messages = {
        'invalid_link': 'Ссылка для сброса пароля недействительна или устарела',
    }

    def validate(self, attrs):
        new_password = attrs.get('new_password') or ''
        new_password_confirm = attrs.get('new_password_confirm') or ''

        if new_password != new_password_confirm:
            raise serializers.ValidationError({'new_password_confirm': ['Пароли не совпадают']})

        return attrs

    def set_user(self, user):
        self.user = user

    def validate_password_rules(self):
        if not self.user:
            raise serializers.ValidationError({'detail': [self.error_messages['invalid_link']]})
        try:
            validate_password(self.validated_data['new_password'], user=self.user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({'new_password': [first_password_error(e.messages)]})

    def save(self, **kwargs):
        if not self.user:
            raise serializers.ValidationError({'detail': [self.error_messages['invalid_link']]})
        self.validate_password_rules()
        user = self.user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class RegistrationRequestCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        email = (attrs.get('email') or '').strip().lower()
        password = attrs.get('password') or ''
        password_confirm = attrs.get('password_confirm') or ''

        if password != password_confirm:
            raise serializers.ValidationError({'password_confirm': ['Пароли не совпадают']})

        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({'email': ['Этот email уже занят']})

        candidate_user = User(username=email, email=email)
        try:
            validate_password(password, user=candidate_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({'password': [first_password_error(e.messages)]})

        attrs['email'] = email
        return attrs


class RegistrationConfirmCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_email(self, value):
        return (value or '').strip().lower()

    def validate_code(self, value):
        code = ''.join(ch for ch in str(value or '') if ch.isdigit())
        if len(code) != 6:
            raise serializers.ValidationError('Введите 6-значный код')
        return code


class EmailChangeRequestSerializer(serializers.Serializer):
    new_email = serializers.EmailField()

    def validate_new_email(self, value):
        return (value or '').strip().lower()


class EmailChangeConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_code(self, value):
        code = ''.join(ch for ch in str(value or '') if ch.isdigit())
        if len(code) != 6:
            raise serializers.ValidationError('Введите 6-значный код')
        return code
