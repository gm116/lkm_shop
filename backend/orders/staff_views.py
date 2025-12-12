from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q

from .models import Order
from .permissions import IsStaffOrWarehouseGroup
from .staff_serializers import StaffOrderSerializer, StaffOrderStatusUpdateSerializer


def _serialize_order(o):
    items = []
    for it in o.items.all():
        items.append({
            'id': it.id,
            'product_id': it.product_id,
            'product_name_snapshot': it.product_name_snapshot,
            'price_snapshot': it.price_snapshot,
            'quantity': it.quantity,
        })

    return {
        'id': o.id,
        'status': o.status,
        'total_amount': o.total_amount,

        'customer_name': o.customer_name,
        'customer_phone': o.customer_phone,
        'customer_email': o.customer_email,

        'delivery_type': o.delivery_type,
        'delivery_city': o.delivery_city,
        'delivery_address_text': o.delivery_address_text,

        'pickup_point_data': o.pickup_point_data,
        'delivery_service': o.delivery_service,
        'delivery_price': o.delivery_price,

        'comment': o.comment,
        'created_at': o.created_at,
        'items': items,
    }


class StaffOrdersListView(APIView):
    permission_classes = [IsStaffOrWarehouseGroup]

    def get(self, request):
        status_q = request.query_params.get('status')
        delivery_type = request.query_params.get('delivery_type')
        q = request.query_params.get('q')

        qs = Order.objects.prefetch_related('items').order_by('-id')

        if status_q:
            qs = qs.filter(status=status_q)

        if delivery_type:
            qs = qs.filter(delivery_type=delivery_type)

        if q:
            qs = qs.filter(
                Q(id__icontains=q) |
                Q(customer_name__icontains=q) |
                Q(customer_phone__icontains=q) |
                Q(customer_email__icontains=q)
            )

        qs = qs[:100]

        data = [_serialize_order(o) for o in qs]
        return Response(data, status=status.HTTP_200_OK)


class StaffOrderDetailView(APIView):
    permission_classes = [IsStaffOrWarehouseGroup]

    def get(self, request, order_id: int):
        try:
            o = Order.objects.prefetch_related('items').get(id=order_id)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_order(o), status=status.HTTP_200_OK)


class StaffOrderStatusUpdateView(APIView):
    permission_classes = [IsStaffOrWarehouseGroup]

    def patch(self, request, order_id: int):
        serializer = StaffOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            o = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        o.status = serializer.validated_data['status']
        o.save(update_fields=['status'])

        return Response({'id': o.id, 'status': o.status}, status=status.HTTP_200_OK)