import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useAuth} from './authContext';

const CartContext = createContext(null);
const LS_KEY = 'guest_cart';

function loadGuestCart() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveGuestCart(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function clearGuestCart() {
    localStorage.removeItem(LS_KEY);
}

function mapApiCartToLocal(apiCart) {
    return (apiCart?.items || []).map(i => ({
        id: i.product_id,
        name: i.product_name,
        slug: i.product_slug || '',
        image_url: i.image_url || '',
        price: Number(i.price),
        stock: i.stock,
        count: i.quantity,
        _cartItemId: i.id,
    }));
}

function guestToSyncItems(guestCart) {
    return (guestCart || [])
        .filter(i => i?.id && i?.count > 0)
        .map(i => ({product_id: i.id, quantity: i.count}));
}

async function readJsonSafe(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function CartProvider({children}) {
    const {isAuthenticated, accessToken, authFetch, logout} = useAuth();

    const [cart, setCart] = useState(() => loadGuestCart());
    const [loading, setLoading] = useState(false);

    // важно: per-item pending, чтобы не моргали все карточки
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const prevAuthRef = useRef(isAuthenticated);
    const skipGuestSaveOnceRef = useRef(false);
    const justAuthedRef = useRef(false);

    const setPending = useCallback((id, on) => {
        setPendingIds(prev => {
            const s = new Set(prev);
            if (on) s.add(id);
            else s.delete(id);
            return s;
        });
    }, []);

    const authedRequest = useCallback(async (url, {method = 'GET', body = null} = {}) => {
        const res = await authFetch(url, {
            method,
            headers: body !== null ? {'Content-Type': 'application/json'} : undefined,
            body: body !== null ? JSON.stringify(body) : undefined,
        });

        if (res.status === 401) {
            await logout();
            throw new Error('Unauthorized');
        }

        const data = await readJsonSafe(res);

        if (!res.ok) {
            const msg = data?.detail || data?.error || 'Request failed';
            throw new Error(msg);
        }

        return data;
    }, [authFetch, logout]);

    const reloadAuthCart = useCallback(async () => {
        if (!isAuthenticated || !accessToken) return;
        const data = await authedRequest('/api/cart/', {method: 'GET'});
        setCart(mapApiCartToLocal(data));
    }, [isAuthenticated, accessToken, authedRequest]);

    useEffect(() => {
        const prev = prevAuthRef.current;
        const next = isAuthenticated;
        prevAuthRef.current = next;

        if (!prev && next) {
            (async () => {
                if (!accessToken) return;

                setLoading(true);
                try {
                    const guestCart = loadGuestCart();
                    const items = guestToSyncItems(guestCart);

                    if (items.length) {
                        await authedRequest('/api/cart/sync/', {method: 'POST', body: {items}});
                        clearGuestCart();
                    }

                    justAuthedRef.current = true;
                    await reloadAuthCart();
                } finally {
                    setLoading(false);
                }
            })();
            return;
        }

        if (prev && !next) {
            skipGuestSaveOnceRef.current = true;
            setCart(loadGuestCart());
            setPendingIds(new Set());
        }
    }, [isAuthenticated, accessToken, authedRequest, reloadAuthCart]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) return;

        if (justAuthedRef.current) {
            justAuthedRef.current = false;
            return;
        }

        (async () => {
            setLoading(true);
            try {
                await reloadAuthCart();
            } finally {
                setLoading(false);
            }
        })();
    }, [isAuthenticated, accessToken, reloadAuthCart]);

    useEffect(() => {
        if (isAuthenticated) return;

        if (skipGuestSaveOnceRef.current) {
            skipGuestSaveOnceRef.current = false;
            return;
        }

        saveGuestCart(cart);
    }, [cart, isAuthenticated]);

    const addToCart = useCallback(async (product) => {
        const productId = product?.id;
        if (!productId) return;

        // гостевой режим — тоже ограничиваем по stock
        if (!isAuthenticated) {
            setCart(prev => {
                const existing = prev.find(i => i.id === productId);
                const nextQty = (existing?.count || 0) + 1;

                const stock = product?.stock;
                if (stock != null && nextQty > Number(stock)) {
                    return prev;
                }

                return existing
                    ? prev.map(i => i.id === productId ? {...i, count: nextQty} : i)
                    : [...prev, {
                        ...product,
                        id: productId,
                        count: 1,
                        image_url: product?.image_url || product?.image || '',
                    }];
            });
            return;
        }

        if (!accessToken) return;

        const existing = cart.find(i => i.id === productId);
        const nextQty = (existing?.count || 0) + 1;

        // автhed режим — не даём уйти за stock (берём из корзины, если есть)
        const stock = existing?.stock ?? product?.stock;
        if (stock != null && nextQty > Number(stock)) return;

        setPending(productId, true);
        try {
            await authedRequest('/api/cart/items/', {
                method: 'POST',
                body: {product_id: productId, quantity: nextQty},
            });
            await reloadAuthCart();
        } finally {
            setPending(productId, false);
        }
    }, [isAuthenticated, accessToken, cart, authedRequest, reloadAuthCart, setPending]);

    const increaseQuantity = useCallback(async (id) => {
        if (!id) return;

        if (!isAuthenticated) {
            setCart(prev => prev.map(i => {
                if (i.id !== id) return i;
                const nextQty = (i.count || 0) + 1;
                if (i.stock != null && nextQty > Number(i.stock)) return i;
                return {...i, count: nextQty};
            }));
            return;
        }

        if (!accessToken) return;

        const item = cart.find(i => i.id === id);
        if (!item) return;

        const nextQty = item.count + 1;
        if (item.stock != null && nextQty > Number(item.stock)) return;

        setPending(id, true);
        try {
            await authedRequest('/api/cart/items/', {
                method: 'POST',
                body: {product_id: id, quantity: nextQty},
            });
            await reloadAuthCart();
        } finally {
            setPending(id, false);
        }
    }, [isAuthenticated, accessToken, cart, authedRequest, reloadAuthCart, setPending]);

    const decreaseCount = useCallback(async (id) => {
        if (!id) return;

        if (!isAuthenticated) {
            setCart(prev =>
                prev
                    .map(i => i.id === id ? {...i, count: i.count - 1} : i)
                    .filter(i => i.count > 0)
            );
            return;
        }

        if (!accessToken) return;

        const item = cart.find(i => i.id === id);
        if (!item) return;

        const nextQty = item.count - 1;

        setPending(id, true);
        try {
            if (nextQty <= 0) {
                if (item._cartItemId) {
                    await authedRequest(`/api/cart/items/${item._cartItemId}/`, {method: 'DELETE'});
                }
            } else {
                await authedRequest('/api/cart/items/', {
                    method: 'POST',
                    body: {product_id: id, quantity: nextQty},
                });
            }

            await reloadAuthCart();
        } finally {
            setPending(id, false);
        }
    }, [isAuthenticated, accessToken, cart, authedRequest, reloadAuthCart, setPending]);

    const removeFromCart = useCallback(async (id) => {
        if (!id) return;

        if (!isAuthenticated) {
            setCart(prev => prev.filter(i => i.id !== id));
            return;
        }

        if (!accessToken) return;

        const item = cart.find(i => i.id === id);
        if (!item || !item._cartItemId) return;

        setPending(id, true);
        try {
            await authedRequest(`/api/cart/items/${item._cartItemId}/`, {method: 'DELETE'});
            await reloadAuthCart();
        } finally {
            setPending(id, false);
        }
    }, [isAuthenticated, accessToken, cart, authedRequest, reloadAuthCart, setPending]);

    const clearCart = useCallback(async () => {
        if (!isAuthenticated) {
            setCart([]);
            clearGuestCart();
            setPendingIds(new Set());
            return;
        }

        if (!accessToken) return;

        setLoading(true);
        try {
            await authedRequest('/api/cart/clear/', {method: 'POST', body: {}});
            await reloadAuthCart();
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, accessToken, authedRequest, reloadAuthCart]);

    const value = useMemo(() => ({
        cart,
        loading,
        pendingIds,
        addToCart,
        increaseQuantity,
        decreaseCount,
        removeFromCart,
        clearCart,
    }), [cart, loading, pendingIds, addToCart, increaseQuantity, decreaseCount, removeFromCart, clearCart]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    return useContext(CartContext);
}