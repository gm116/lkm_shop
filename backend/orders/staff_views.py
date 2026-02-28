from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.db.models.functions import Cast
from django.db.models import CharField

from .models import Order
from .permissions import IsStaffOrWarehouseGroup
from .staff_serializers import StaffOrderStatusUpdateSerializer
from .serializers import serialize_order


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
            qs = qs.annotate(id_text=Cast('id', output_field=CharField()))
            qs = qs.filter(
                Q(id_text__icontains=q) |
                Q(customer_name__icontains=q) |
                Q(customer_phone__icontains=q) |
                Q(customer_email__icontains=q)
            )

        qs = qs[:100]

        data = [serialize_order(order, include_customer=True) for order in qs]
        return Response(data, status=status.HTTP_200_OK)


class StaffOrderDetailView(APIView):
    permission_classes = [IsStaffOrWarehouseGroup]

    def get(self, request, order_id: int):
        try:
            o = Order.objects.prefetch_related('items').get(id=order_id)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(serialize_order(o, include_customer=True), status=status.HTTP_200_OK)


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
        o.save(update_fields=['status', 'updated_at'])
        o.refresh_from_db()

        return Response(serialize_order(o, include_customer=True), status=status.HTTP_200_OK)
