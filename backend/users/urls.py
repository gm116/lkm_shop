from django.urls import path
from .views import RegisterView, LoginView, RefreshView, LogoutView, MeView, MePermissionsView
from .address_api import AddressListCreateView, AddressDetailView, AddressSetDefaultView
from .me_api import MePrefillView

urlpatterns = [
    path('register/', RegisterView.as_view()),
    path('login/', LoginView.as_view()),
    path('refresh/', RefreshView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('me/', MeView.as_view()),
    path('me/permissions/', MePermissionsView.as_view()),
    path('me/prefill/', MePrefillView.as_view()),
    path('addresses/', AddressListCreateView.as_view()),
    path('addresses/<int:pk>/', AddressDetailView.as_view()),
    path('addresses/<int:pk>/set-default/', AddressSetDefaultView.as_view()),
]
