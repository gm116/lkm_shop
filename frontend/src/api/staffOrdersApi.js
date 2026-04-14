async function request(path, {method = 'GET', token = '', body = null} = {}) {
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, {
        method,
        credentials: 'include',
        headers,
        body: body !== null ? JSON.stringify(body) : null,
    });

    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }

    if (!res.ok) {
        const msg = data?.detail || 'Ошибка запроса';
        throw new Error(msg);
    }

    return data;
}

export function staffGetOrders(token, params = {}) {
    const sp = new URLSearchParams();

    if (params.status) sp.set('status', params.status);
    if (params.delivery_type) sp.set('delivery_type', params.delivery_type);
    if (params.q) sp.set('q', params.q);

    const qs = sp.toString();
    const url = qs ? `/api/staff/orders/?${qs}` : '/api/staff/orders/';

    return request(url, {method: 'GET', token});
}

export function staffGetOrderById(token, orderId) {
    return request(`/api/staff/orders/${orderId}/`, {method: 'GET', token});
}

export function staffUpdateOrderStatus(token, orderId, statusValue) {
    return request(`/api/staff/orders/${orderId}/status/`, {
        method: 'PATCH',
        token,
        body: {status: statusValue},
    });
}

export function getMyPermissions(token) {
    return request('/api/users/me/permissions/', {method: 'GET', token});
}
