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

export function getCart(token) {
    return request('/api/cart/', {method: 'GET', token});
}

export function syncCart(token, items) {
    return request('/api/cart/sync/', {
        method: 'POST',
        token,
        body: {items},
    });
}

export function upsertCartItem(token, productId, quantity) {
    return request('/api/cart/items/', {
        method: 'POST',
        token,
        body: {
            product_id: productId,
            quantity,
        },
    });
}

export function deleteCartItem(token, itemId) {
    return request(`/api/cart/items/${itemId}/`, {
        method: 'DELETE',
        token,
    });
}

export function clearCartApi(token) {
    return request('/api/cart/clear/', {
        method: 'POST',
        token,
        body: {},
    });
}