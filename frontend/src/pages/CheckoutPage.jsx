import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';

import {useCart} from '../store/cartContext';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';

import styles from '../styles/CheckoutPage.module.css';

function buildFullName(prefill) {
    const first = (prefill?.first_name || '').trim();
    const last = (prefill?.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    return full || (prefill?.username || '');
}

export default function CheckoutPage() {
    const navigate = useNavigate();
    const notify = useNotify();

    const {cart, clearCart} = useCart();
    const {accessToken, isAuthenticated, authFetch, logout} = useAuth();

    const [loading, setLoading] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [error, setError] = useState('');
    // eslint-disable-next-line
    const [prefill, setPrefill] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');

    const [checkoutInProgress, setCheckoutInProgress] = useState(false);
    const [deliveryType, setDeliveryType] = useState('store_pickup'); // store_pickup | courier | pvz
    const [deliveryService, setDeliveryService] = useState('cdek');

    const [pickupId, setPickupId] = useState('');
    const [pickupName, setPickupName] = useState('');
    const [pickupAddress, setPickupAddress] = useState('');
    const [pvzCity, setPvzCity] = useState('');

    const [comment, setComment] = useState('');

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    const selectedAddress = useMemo(() => {
        const idNum = Number(selectedAddressId);
        return addresses.find(a => a.id === idNum) || null;
    }, [addresses, selectedAddressId]);

    const itemsTotal = useMemo(() => {
        return cart.reduce((sum, it) => sum + Number(it.price) * Number(it.count), 0);
    }, [cart]);

    const canSubmit = useMemo(() => {
        if (!isAuthenticated) return false;
        if (!accessToken) return false;
        if (cart.length === 0) return false;

        if (!customerName.trim()) return false;
        if (!customerPhone.trim()) return false;

        if (deliveryType === 'courier') {
            if (!selectedAddress) return false;
        }

        if (deliveryType === 'pvz') {
            if (!pvzCity.trim()) return false;
            if (!pickupId.trim()) return false;
            if (!pickupName.trim()) return false;
            if (!pickupAddress.trim()) return false;
        }

        return true;
    }, [
        isAuthenticated,
        accessToken,
        cart.length,
        customerName,
        customerPhone,
        deliveryType,
        selectedAddress,
        pvzCity,
        pickupId,
        pickupName,
        pickupAddress,
    ]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            setInitLoading(false);
            return;
        }

        (async () => {
            setInitLoading(true);
            setError('');

            try {
                const [prefillRes, addrRes] = await Promise.all([
                    authFetch('/api/users/me/prefill/', {
                        method: 'GET',
                        credentials: 'include',
                    }),
                    authFetch('/api/users/addresses/', {
                        method: 'GET',
                        credentials: 'include',
                    }),
                ]);

                if (prefillRes.status === 401 || addrRes.status === 401) {
                    await logout();
                    return;
                }

                const prefillJson = await prefillRes.json().catch(() => null);
                const addrJson = await addrRes.json().catch(() => []);

                if (!prefillRes.ok) {
                    throw new Error(prefillJson?.detail || 'Не удалось загрузить данные профиля');
                }

                if (!addrRes.ok) {
                    throw new Error(addrJson?.detail || 'Не удалось загрузить адреса');
                }

                setPrefill(prefillJson);
                setAddresses(Array.isArray(addrJson) ? addrJson : []);

                const name = buildFullName(prefillJson);
                const email = (prefillJson?.email || '').trim();

                const defAddr = prefillJson?.default_address || null;
                const phone = (defAddr?.phone || '').trim();

                setCustomerName(prev => (prev ? prev : name));
                setCustomerEmail(prev => (prev ? prev : email));
                setCustomerPhone(prev => (prev ? prev : phone));

                const defaultId = defAddr?.id ? String(defAddr.id) : '';
                if (defaultId) {
                    setSelectedAddressId(defaultId);
                } else if (Array.isArray(addrJson) && addrJson.length > 0) {
                    setSelectedAddressId(String(addrJson[0].id));
                }
            } catch (e) {
                setError(e.message || 'Ошибка инициализации');
            } finally {
                setInitLoading(false);
            }
        })();
    }, [isAuthenticated, accessToken, authFetch, logout]);

    const submitOrder = async (e) => {
        e.preventDefault();
        setError('');

        if (!canSubmit) {
            const message = 'Заполни обязательные поля';
            setError(message);
            notify.warning(message);
            return;
        }

        const payload = {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim(),
            delivery_type: deliveryType,
            delivery_service: deliveryType === 'pvz' ? deliveryService : '',
            delivery_city: '',
            delivery_address_text: '',
            comment: comment.trim(),
            items: cart.map(it => ({product_id: it.id, quantity: it.count})),
        };

        if (deliveryType === 'courier') {
            payload.delivery_city = selectedAddress?.city || '';
            payload.delivery_address_text = selectedAddress
                ? `${selectedAddress.address_line}${selectedAddress.comment ? `, ${selectedAddress.comment}` : ''}`
                : '';
        }

        if (deliveryType === 'pvz') {
            payload.delivery_city = pvzCity.trim();
            payload.pickup_point_data = {
                id: pickupId.trim(),
                name: pickupName.trim(),
                address: pickupAddress.trim(),
            };
        }

        if (deliveryType === 'store_pickup') {
            payload.pickup_point_data = {
                id: 'store_default',
                name: 'Самовывоз',
                address: 'Адрес магазина',
            };
        }

        setLoading(true);
        setCheckoutInProgress(true);

        try {
            const resOrder = await authFetch('/api/orders/create-from-cart/', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });

            if (resOrder.status === 401) {
                await logout();
                setCheckoutInProgress(false);
                return;
            }

            const orderData = await resOrder.json().catch(() => null);
            if (!resOrder.ok) throw new Error(orderData?.detail || 'Ошибка оформления заказа');

            const orderId = orderData?.order_id;
            if (!orderId) throw new Error('Не пришел order_id');

            const resPay = await authFetch('/api/payments/create/', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({order_id: orderId}),
            });

            const payData = await resPay.json().catch(() => null);
            if (!resPay.ok) throw new Error(payData?.detail || 'Ошибка создания платежа');

            const confirmationUrl = payData?.confirmation_url;
            if (!confirmationUrl) throw new Error('Не пришел confirmation_url');

            await clearCart();
            notify.success('Заказ создан, перенаправляю на оплату');

            navigate('/checkout/redirect', {
                replace: true,
                state: {orderId, confirmationUrl},
            });

            // важно: НЕ делаем setCheckoutInProgress(false) тут
            // мы уходим со страницы
        } catch (err) {
            setError(err?.message || 'Ошибка');
            setCheckoutInProgress(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (checkoutInProgress) return;
        if (loading) return;
        if (cart.length === 0 && isAuthenticated) {
            navigate('/profile', {replace: true});
        }
    }, [cart.length, checkoutInProgress, loading, isAuthenticated, navigate]);

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Оформление заказа</h2>
                <div className={styles.card}>Нужно войти, чтобы оформить заказ</div>
            </div>
        );
    }

    if (cart.length === 0) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Оформление заказа</h2>
                <div className={styles.card}>Корзина пуста</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Оформление заказа</h2>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Контактные данные</div>

                    {error && <div className={styles.error}>{error}</div>}

                    {initLoading ? (
                        <div className={styles.note}>Загрузка данных профиля...</div>
                    ) : null}

                    <form className={styles.form} onSubmit={submitOrder}>
                        <input
                            className={styles.input}
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="ФИО"
                        />

                        <div className={styles.row2}>
                            <input
                                className={styles.input}
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                placeholder="Телефон"
                            />
                            <input
                                className={styles.input}
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                placeholder="Email (необязательно)"
                            />
                        </div>

                        <div className={styles.sectionTitle}>Способ получения</div>

                        <div className={styles.switchRow}>
                            <button
                                type="button"
                                className={`${styles.switchBtn} ${deliveryType === 'store_pickup' ? styles.switchActive : ''}`}
                                onClick={() => setDeliveryType('store_pickup')}
                            >
                                Самовывоз
                            </button>
                            <button
                                type="button"
                                className={`${styles.switchBtn} ${deliveryType === 'courier' ? styles.switchActive : ''}`}
                                onClick={() => setDeliveryType('courier')}
                            >
                                Курьер
                            </button>
                            <button
                                type="button"
                                className={`${styles.switchBtn} ${deliveryType === 'pvz' ? styles.switchActive : ''}`}
                                onClick={() => setDeliveryType('pvz')}
                            >
                                ПВЗ
                            </button>
                        </div>

                        {deliveryType === 'store_pickup' && (
                            <div className={styles.note}>
                                Самовывоз: заберёте заказ в точке выдачи магазина (адрес добавим позже).
                            </div>
                        )}

                        {deliveryType === 'courier' && (
                            <>
                                <div className={styles.note}>
                                    Курьер: выбери адрес доставки из профиля.
                                </div>

                                <select
                                    className={styles.select}
                                    value={selectedAddressId}
                                    onChange={(e) => setSelectedAddressId(e.target.value)}
                                >
                                    <option value="">Выбери адрес</option>
                                    {addresses.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.city}, {a.address_line}{a.is_default ? ' (основной)' : ''}
                                        </option>
                                    ))}
                                </select>

                                {selectedAddress && (
                                    <div className={styles.addressPreview}>
                                        <div><strong>{selectedAddress.city}</strong></div>
                                        <div>{selectedAddress.address_line}</div>
                                        {selectedAddress.recipient_name ?
                                            <div>Получатель: {selectedAddress.recipient_name}</div> : null}
                                        {selectedAddress.phone ? <div>Телефон: {selectedAddress.phone}</div> : null}
                                    </div>
                                )}
                            </>
                        )}

                        {deliveryType === 'pvz' && (
                            <>
                                <div className={styles.note}>
                                    ПВЗ: пока ввод вручную (позже подключим агрегатор и выбор на карте/в списке).
                                </div>

                                <input
                                    className={styles.input}
                                    value={deliveryService}
                                    onChange={(e) => setDeliveryService(e.target.value)}
                                    placeholder="Служба доставки (например cdek)"
                                />

                                <input
                                    className={styles.input}
                                    value={pvzCity}
                                    onChange={(e) => setPvzCity(e.target.value)}
                                    placeholder="Город для ПВЗ"
                                />

                                <input
                                    className={styles.input}
                                    value={pickupId}
                                    onChange={(e) => setPickupId(e.target.value)}
                                    placeholder="ID ПВЗ (например cdek_001)"
                                />
                                <input
                                    className={styles.input}
                                    value={pickupName}
                                    onChange={(e) => setPickupName(e.target.value)}
                                    placeholder="Название ПВЗ"
                                />
                                <input
                                    className={styles.input}
                                    value={pickupAddress}
                                    onChange={(e) => setPickupAddress(e.target.value)}
                                    placeholder="Адрес ПВЗ"
                                />
                            </>
                        )}

                        <textarea
                            className={styles.textarea}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Комментарий к заказу (необязательно)"
                        />

                        <button className={styles.btn} type="submit" disabled={loading || !canSubmit}>
                            {loading ? 'Оформляем...' : 'Оформить заказ'}
                        </button>
                    </form>
                </div>

                <div className={styles.card}>
                    <div className={styles.sectionTitle}>Состав заказа</div>

                    <div className={styles.items}>
                        {cart.map(it => (
                            <div className={styles.itemRow} key={it.id}>
                                <div className={styles.itemName}>{it.name}</div>
                                <div className={styles.itemMeta}>
                                    <span>{it.count} шт</span>
                                    <span>{(Number(it.price) * Number(it.count)).toLocaleString()} ₽</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.totalRow}>
                        <span>Итого</span>
                        <span>{itemsTotal.toLocaleString()} ₽</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
