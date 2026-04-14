import { apiPost } from './client';

export function registerUser(payload) {
    return apiPost('/api/users/register/', payload);
}

export function loginUser(payload) {
    return apiPost('/api/users/login/', payload);
}

export function requestPasswordReset(payload) {
    return apiPost('/api/users/password-reset/request/', payload);
}

export function validatePasswordReset(payload) {
    return apiPost('/api/users/password-reset/validate/', payload);
}

export function confirmPasswordReset(payload) {
    return apiPost('/api/users/password-reset/confirm/', payload);
}

export function refreshAccessToken() {
    return apiPost('/api/users/refresh/', {});
}

export function logoutUser() {
    return apiPost('/api/users/logout/', {});
}
