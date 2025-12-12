from rest_framework.permissions import BasePermission


class IsStaffOrWarehouseGroup(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.is_staff:
            return True

        return user.groups.filter(name='warehouse').exists()
