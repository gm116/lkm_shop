from django.contrib.auth.models import User
from rest_framework import serializers


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

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'].strip(),
            email=validated_data.get('email', '').strip(),
            password=validated_data['password'],
        )
