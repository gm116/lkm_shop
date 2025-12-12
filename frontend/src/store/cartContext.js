import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {clearCartApi, deleteCartItem, getCart, syncCart, upsertCartItem} from '../api/cartApi';
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
        price: Number(i.price),
        count: i.quantity,
        _cartItemId: i.id,
    }));
}

function guestToSyncItems(guestCart) {
    return (guestCart || [])
        .filter(i => i?.id && i?.count > 0)
        .map(i => ({product_id: i.id, quantity: i.count}));
}

export function CartProvider({children}) {
    const {isAuthenticated, accessToken} = useAuth();

    const [cart, setCart] = useState(() => loadGuestCart());
    const [loading, setLoading] = useState(false);

    const prevAuthRef = useRef(isAuthenticated);
    const skipGuestSaveOnceRef = useRef(false);

    const reloadAuthCart = useCallback(async () => {
        if (!isAuthenticated || !accessToken) return;
        const data = await getCart(accessToken);
        setCart(mapApiCartToLocal(data));
    }, [isAuthenticated, accessToken]);

    // 1) Переходы auth <-> guest
    useEffect(() => {
        const prev = prevAuthRef.current;
        const next = isAuthenticated;
        prevAuthRef.current = next;

        // guest -> auth
        if (!prev && next) {
            (async () => {
                if (!accessToken) return;

                setLoading(true);
                try {
                    const guestCart = loadGuestCart();
                    const items = guestToSyncItems(guestCart);

                    if (items.length) {
                        await syncCart(accessToken, items);
                        clearGuestCart();
                    }

                    await reloadAuthCart();
                } finally {
                    setLoading(false);
                }
            })();
            return;
        }

        // auth -> guest
        if (prev && !next) {
            // Важно: не сохраняем "авторизованную" корзину в localStorage
            // Просто переключаемся на гостевую (обычно пустую)
            skipGuestSaveOnceRef.current = true;
            setCart(loadGuestCart());
        }
    }, [isAuthenticated, accessToken, reloadAuthCart]);

    // 2) Если пользователь уже залогинен (например refresh на старте) — загрузить корзину из БД
    useEffect(() => {
        if (!isAuthenticated || !accessToken) return;

        // если пришли сюда после guest->auth, reload уже был
        // но этот эффект безопасен (просто подтянет актуальное)
        (async () => {
            setLoading(true);
            try {
                await reloadAuthCart();
            } finally {
                setLoading(false);
            }
        })();
    }, [isAuthenticated, accessToken, reloadAuthCart]);

    // 3) Сохраняем только гостевую корзину и только когда это реально гостевой режим
    useEffect(() => {
        if (isAuthenticated) return;

        if (skipGuestSaveOnceRef.current) {
            skipGuestSaveOnceRef.current = false;
            return;
        }

        saveGuestCart(cart);
    }, [cart, isAuthenticated]);

    const addToCart = useCallback(async (product) => {
        if (!isAuthenticated) {
            setCart(prev =>
                prev.find(i => i.id === product.id)
                    ? prev.map(i => i.id === product.id ? {...i, count: i.count + 1} : i)
                    : [...prev, {...product, count: 1}]
            );
            return;
        }

        if (!accessToken) return;

        const existing = cart.find(i => i.id === product.id);
        const nextQty = (existing?.count || 0) + 1;

        await upsertCartItem(accessToken, product.id, nextQty);
        await reloadAuthCart();
    }, [isAuthenticated, accessToken, cart, reloadAuthCart]);

    const decreaseCount = useCallback(async (id) => {
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

        if (nextQty <= 0) {
            if (item._cartItemId) {
                await deleteCartItem(accessToken, item._cartItemId);
            }
        } else {
            await upsertCartItem(accessToken, id, nextQty);
        }

        await reloadAuthCart();
    }, [isAuthenticated, accessToken, cart, reloadAuthCart]);

    const removeFromCart = useCallback(async (id) => {
        if (!isAuthenticated) {
            setCart(prev => prev.filter(i => i.id !== id));
            return;
        }

        if (!accessToken) return;

        const item = cart.find(i => i.id === id);
        if (!item || !item._cartItemId) return;

        await deleteCartItem(accessToken, item._cartItemId);
        await reloadAuthCart();
    }, [isAuthenticated, accessToken, cart, reloadAuthCart]);

    const clearCart = useCallback(async () => {
        if (!isAuthenticated) {
            setCart([]);
            clearGuestCart();
            return;
        }

        if (!accessToken) return;

        await clearCartApi(accessToken);
        await reloadAuthCart();
    }, [isAuthenticated, accessToken, reloadAuthCart]);

    const value = useMemo(() => ({
        cart,
        loading,
        addToCart,
        decreaseCount,
        removeFromCart,
        clearCart,
    }), [cart, loading, addToCart, decreaseCount, removeFromCart, clearCart]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    return useContext(CartContext);
}