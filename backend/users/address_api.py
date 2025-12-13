from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db import transaction

from .models import Address


class AddressSerializer:
    @staticmethod
    def to_representation(obj: Address):
        return {
            'id': obj.id,
            'label': obj.label,
            'city': obj.city,
            'address_line': obj.address_line,
            'recipient_name': obj.recipient_name,
            'phone': obj.phone,
            'comment': obj.comment,
            'is_default': obj.is_default,
        }

    @staticmethod
    def validate(data):
        city = (data.get('city') or '').strip()
        address_line = (data.get('address_line') or '').strip()

        if not city:
            return None, {'city': ['Обязательное поле']}
        if not address_line:
            return None, {'address_line': ['Обязательное поле']}

        return {
            'label': (data.get('label') or '').strip(),
            'city': city,
            'address_line': address_line,
            'recipient_name': (data.get('recipient_name') or '').strip(),
            'phone': (data.get('phone') or '').strip(),
            'comment': (data.get('comment') or '').strip(),
            'is_default': bool(data.get('is_default', False)),
        }, None


class AddressListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Address.objects.filter(user=request.user).order_by('-is_default', '-id')
        return Response([AddressSerializer.to_representation(a) for a in qs])

    def post(self, request):
        payload, errors = AddressSerializer.validate(request.data or {})
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            addr = Address.objects.create(user=request.user, **payload)

            if addr.is_default:
                Address.objects.filter(user=request.user).exclude(id=addr.id).update(is_default=False)

        return Response(AddressSerializer.to_representation(addr), status=status.HTTP_201_CREATED)


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return Address.objects.get(user=request.user, pk=pk)

    def patch(self, request, pk):
        addr = self.get_object(request, pk)

        payload, errors = AddressSerializer.validate({**AddressSerializer.to_representation(addr), **(request.data or {})})
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for k, v in payload.items():
                setattr(addr, k, v)
            addr.save()

            if addr.is_default:
                Address.objects.filter(user=request.user).exclude(id=addr.id).update(is_default=False)

        return Response(AddressSerializer.to_representation(addr))

    def delete(self, request, pk):
        addr = self.get_object(request, pk)
        addr.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AddressSetDefaultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            addr = Address.objects.get(user=request.user, pk=pk)
            Address.objects.filter(user=request.user).update(is_default=False)
            addr.is_default = True
            addr.save(update_fields=['is_default'])

        return Response({'ok': True})