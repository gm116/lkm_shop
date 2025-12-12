import { apiPost } from './client';

export function registerUser(payload) {
    return apiPost('/api/users/register/', payload);
}

export function loginUser(payload) {
    return apiPost('/api/users/login/', payload);
}

export function refreshAccessToken() {
    return apiPost('/api/users/refresh/', {});
}

export function logoutUser() {
    return apiPost('/api/users/logout/', {});
}