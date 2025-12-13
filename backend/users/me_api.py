from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Address


class MePrefillView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user

        default_addr = Address.objects.filter(user=u, is_default=True).first()
        if not default_addr:
            default_addr = Address.objects.filter(user=u).order_by('-id').first()

        address = None
        if default_addr:
            address = {
                'id': default_addr.id,
                'label': default_addr.label,
                'city': default_addr.city,
                'address_line': default_addr.address_line,
                'recipient_name': default_addr.recipient_name,
                'phone': default_addr.phone,
                'comment': default_addr.comment,
                'is_default': default_addr.is_default,
            }

        return Response({
            'username': u.username,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'default_address': address,
        })