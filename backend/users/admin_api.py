from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models import DecimalField
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from orders.models import Order


User = get_user_model()


class IsUsersAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'1', 'true', 'yes', 'on'}:
            return True
        if normalized in {'0', 'false', 'no', 'off'}:
            return False
    raise ValueError('invalid_bool')


def serialize_admin_user(user):
    first_name = (user.first_name or '').strip()
    last_name = (user.last_name or '').strip()
    full_name = f'{first_name} {last_name}'.strip()
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'full_name': full_name,
        'is_active': bool(user.is_active),
        'is_staff': bool(user.is_staff),
        'is_superuser': bool(user.is_superuser),
        'last_login': user.last_login,
        'date_joined': user.date_joined,
        'orders_count': int(getattr(user, 'orders_count', 0) or 0),
    }


class AdminUsersListView(APIView):
    permission_classes = [IsUsersAdmin]

    @staticmethod
    def base_queryset():
        return User.objects.annotate(orders_count=Count('orders', distinct=True)).order_by('-date_joined', '-id')

    def get(self, request):
        qs = self.base_queryset()

        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        status_filter = (request.query_params.get('status') or '').strip().lower()
        if status_filter == 'active':
            qs = qs.filter(is_active=True)
        elif status_filter == 'blocked':
            qs = qs.filter(is_active=False)

        role_filter = (request.query_params.get('role') or '').strip().lower()
        if role_filter == 'staff':
            qs = qs.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif role_filter == 'customers':
            qs = qs.filter(is_staff=False, is_superuser=False)

        page_size = 12
        try:
            page = max(int(request.query_params.get('page', '1')), 1)
        except (TypeError, ValueError):
            page = 1

        total = qs.count()
        total_pages = max((total + page_size - 1) // page_size, 1)
        if page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size

        users = qs[start:end]
        return Response(
            {
                'results': [serialize_admin_user(user) for user in users],
                'count': total,
                'page': page,
                'page_size': page_size,
                'total_pages': total_pages,
            },
            status=status.HTTP_200_OK,
        )


class AdminUserStatusView(APIView):
    permission_classes = [IsUsersAdmin]

    def patch(self, request, user_id: int):
        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Пользователь не найден'}, status=status.HTTP_404_NOT_FOUND)

        if 'is_active' not in request.data:
            return Response({'detail': 'Передайте поле is_active'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_active = _as_bool(request.data.get('is_active'))
        except ValueError:
            return Response({'detail': 'Поле is_active должно быть булевым'}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.id == target.id and not new_active:
            return Response({'detail': 'Нельзя заблокировать свою учетную запись'}, status=status.HTTP_400_BAD_REQUEST)

        if target.is_superuser and not new_active:
            return Response({'detail': 'Нельзя заблокировать суперпользователя'}, status=status.HTTP_400_BAD_REQUEST)

        if target.is_active != new_active:
            target.is_active = new_active
            target.save(update_fields=['is_active'])

        target = User.objects.annotate(orders_count=Count('orders', distinct=True)).get(id=target.id)
        return Response(serialize_admin_user(target), status=status.HTTP_200_OK)

    def post(self, request, user_id: int):
        return self.patch(request, user_id)


class AdminUserOrdersView(APIView):
    permission_classes = [IsUsersAdmin]

    def get(self, request, user_id: int):
        try:
            User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Пользователь не найден'}, status=status.HTTP_404_NOT_FOUND)

        base_qs = Order.objects.filter(user_id=user_id)

        stats_raw = base_qs.aggregate(
            orders_total=Count('id'),
            spent_total=Coalesce(
                Sum('total_amount'),
                0,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            completed_revenue=Coalesce(
                Sum('total_amount', filter=Q(status__in=['paid', 'completed'])),
                0,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            new_count=Count('id', filter=Q(status='new')),
            paid_count=Count('id', filter=Q(status='paid')),
            shipped_count=Count('id', filter=Q(status='shipped')),
            completed_count=Count('id', filter=Q(status='completed')),
            canceled_count=Count('id', filter=Q(status='canceled')),
        )

        orders_total = int(stats_raw.get('orders_total') or 0)
        spent_total = stats_raw.get('spent_total') or 0
        avg_check = (spent_total / orders_total) if orders_total else 0

        orders = (
            Order.objects
            .filter(user_id=user_id)
            .prefetch_related('items')
            .order_by('-created_at', '-id')[:12]
        )

        payload = []
        for order in orders:
            payload.append({
                'id': order.id,
                'status': order.status,
                'total_amount': order.total_amount,
                'items_count': sum(int(item.quantity or 0) for item in order.items.all()),
                'delivery_type': order.delivery_type,
                'created_at': order.created_at,
            })

        return Response(
            {
                'stats': {
                    'orders_total': orders_total,
                    'spent_total': spent_total,
                    'completed_revenue': stats_raw.get('completed_revenue') or 0,
                    'avg_check': avg_check,
                    'new_count': int(stats_raw.get('new_count') or 0),
                    'paid_count': int(stats_raw.get('paid_count') or 0),
                    'shipped_count': int(stats_raw.get('shipped_count') or 0),
                    'completed_count': int(stats_raw.get('completed_count') or 0),
                    'canceled_count': int(stats_raw.get('canceled_count') or 0),
                },
                'results': payload,
            },
            status=status.HTTP_200_OK,
        )
