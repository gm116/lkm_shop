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
        const msg = data?.detail || 'Request failed';
        throw new Error(msg);
    }

    return data;
}

export function createOrderFromCart(token, payload) {
    return request('/api/orders/create-from-cart/', {
        method: 'POST',
        token,
        body: payload,
    });
}

export function getMyOrders(token) {
    return request('/api/orders/my/', {
        method: 'GET',
        token,
    });
}

export function getOrderById(token, orderId) {
    return request(`/api/orders/${orderId}/`, {
        method: 'GET',
        token,
    });
}