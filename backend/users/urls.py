from django.urls import path
from .views import LoginView, RefreshView, LogoutView, MeView, MePermissionsView, PasswordResetRequestView, PasswordResetConfirmView, PasswordResetValidateView
from .registration_api import RegistrationRequestCodeView, RegistrationConfirmCodeView
from .email_change_api import EmailChangeRequestView, EmailChangeConfirmView
from .address_api import AddressListCreateView, AddressDetailView, AddressSetDefaultView
from .me_api import MePrefillView
from .feedback_api import FeedbackSendView
from .admin_api import AdminUsersListView, AdminUserStatusView, AdminUserOrdersView

urlpatterns = [
    path('register/', RegistrationRequestCodeView.as_view()),
    path('register/confirm/', RegistrationConfirmCodeView.as_view()),
    path('email-change/request/', EmailChangeRequestView.as_view()),
    path('email-change/confirm/', EmailChangeConfirmView.as_view()),
    path('login/', LoginView.as_view()),
    path('password-reset/request/', PasswordResetRequestView.as_view()),
    path('password-reset/validate/', PasswordResetValidateView.as_view()),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view()),
    path('refresh/', RefreshView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('me/', MeView.as_view()),
    path('me/permissions/', MePermissionsView.as_view()),
    path('me/prefill/', MePrefillView.as_view()),
    path('addresses/', AddressListCreateView.as_view()),
    path('addresses/<int:pk>/', AddressDetailView.as_view()),
    path('addresses/<int:pk>/set-default/', AddressSetDefaultView.as_view()),
    path('feedback/', FeedbackSendView.as_view()),
    path('admin/users/', AdminUsersListView.as_view()),
    path('admin/users/<int:user_id>/status/', AdminUserStatusView.as_view()),
    path('admin/users/<int:user_id>/orders/', AdminUserOrdersView.as_view()),
]
