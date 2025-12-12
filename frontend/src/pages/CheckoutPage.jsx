import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useCart} from '../store/cartContext';
import {useAuth} from '../store/authContext';
import {createOrderFromCart} from '../api/ordersApi';
import styles from '../styles/CheckoutPage.module.css';

export default function CheckoutPage() {
    const navigate = useNavigate();
    const {cart, clearCart} = useCart();
    const {accessToken, isAuthenticated} = useAuth();

    const total = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.price * item.count, 0);
    }, [cart]);

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');

    const [deliveryType, setDeliveryType] = useState('pickup');

    const [deliveryCity, setDeliveryCity] = useState('');
    const [deliveryAddressText, setDeliveryAddressText] = useState('');

    const [pickupPointName, setPickupPointName] = useState('');
    const [pickupPointAddress, setPickupPointAddress] = useState('');

    const [deliveryService, setDeliveryService] = useState('cdek');
    const [deliveryPrice, setDeliveryPrice] = useState('0');

    const [comment, setComment] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const canSubmit = useMemo(() => {
        if (!isAuthenticated) return false;
        if (!accessToken) return false;
        if (!cart.length) return false;

        if (!customerName.trim()) return false;
        if (!customerPhone.trim()) return false;

        if (deliveryType === 'courier') {
            if (!deliveryCity.trim()) return false;
            if (!deliveryAddressText.trim()) return false;
        }

        if (deliveryType === 'pickup') {
            if (!pickupPointName.trim()) return false;
            if (!pickupPointAddress.trim()) return false;
        }

        return true;
    }, [
        isAuthenticated,
        accessToken,
        cart.length,
        customerName,
        customerPhone,
        deliveryType,
        deliveryCity,
        deliveryAddressText,
        pickupPointName,
        pickupPointAddress,
    ]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!canSubmit) return;

        const payload = {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim(),

            delivery_type: deliveryType,

            delivery_city: deliveryType === 'courier' ? deliveryCity.trim() : '',
            delivery_address_text: deliveryType === 'courier' ? deliveryAddressText.trim() : '',

            pickup_point_data: deliveryType === 'pickup'
                ? {
                    id: '',
                    name: pickupPointName.trim(),
                    address: pickupPointAddress.trim(),
                }
                : undefined,

            delivery_service: deliveryService.trim(),
            delivery_price: Number(deliveryPrice || 0),

            comment: comment.trim(),
        };

        setLoading(true);
        try {
            const r = await createOrderFromCart(accessToken, payload);
            await clearCart();
            navigate('/profile', {state: {orderId: r.order_id}});
        } catch (err) {
            setError(err.message || 'Ошибка оформления');
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Оформление заказа</h2>
                <div className={styles.card}>
                    <div className={styles.note}>
                        Нужно войти, чтобы оформить заказ.
                    </div>
                    <button className={styles.btn} onClick={() => navigate('/login')}>
                        Войти
                    </button>
                </div>
            </div>
        );
    }

    if (!cart.length) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Оформление заказа</h2>
                <div className={styles.card}>
                    <div className={styles.note}>Корзина пуста</div>
                    <button className={styles.btn} onClick={() => navigate('/catalog')}>
                        Перейти в каталог
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Оформление заказа</h2>

            <div className={styles.grid}>
                <div className={styles.left}>
                    <div className={styles.card}>
                        <div className={styles.sectionTitle}>Состав заказа</div>

                        <div className={styles.items}>
                            {cart.map(item => (
                                <div key={item.id} className={styles.itemRow}>
                                    <div className={styles.itemName}>{item.name}</div>
                                    <div className={styles.itemMeta}>
                                        <span>{item.count} шт</span>
                                        <span>{(item.price * item.count).toLocaleString()} ₽</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.totalRow}>
                            <span>Итого</span>
                            <span>{total.toLocaleString()} ₽</span>
                        </div>
                    </div>
                </div>

                <div className={styles.right}>
                    <form className={styles.card} onSubmit={onSubmit}>
                        <div className={styles.sectionTitle}>Контакты</div>

                        {error && <div className={styles.error}>{error}</div>}

                        <div className={styles.form}>
                            <input
                                className={styles.input}
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="ФИО"
                            />
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

                            <div className={styles.sectionTitle}>Доставка</div>

                            <div className={styles.switchRow}>
                                <button
                                    type="button"
                                    className={`${styles.switchBtn} ${deliveryType === 'pickup' ? styles.switchActive : ''}`}
                                    onClick={() => setDeliveryType('pickup')}
                                >
                                    Самовывоз (ПВЗ)
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.switchBtn} ${deliveryType === 'courier' ? styles.switchActive : ''}`}
                                    onClick={() => setDeliveryType('courier')}
                                >
                                    Курьер
                                </button>
                            </div>

                            {deliveryType === 'courier' && (
                                <>
                                    <input
                                        className={styles.input}
                                        value={deliveryCity}
                                        onChange={(e) => setDeliveryCity(e.target.value)}
                                        placeholder="Город"
                                    />
                                    <input
                                        className={styles.input}
                                        value={deliveryAddressText}
                                        onChange={(e) => setDeliveryAddressText(e.target.value)}
                                        placeholder="Адрес"
                                    />
                                </>
                            )}

                            {deliveryType === 'pickup' && (
                                <>
                                    <input
                                        className={styles.input}
                                        value={pickupPointName}
                                        onChange={(e) => setPickupPointName(e.target.value)}
                                        placeholder="Название ПВЗ"
                                    />
                                    <input
                                        className={styles.input}
                                        value={pickupPointAddress}
                                        onChange={(e) => setPickupPointAddress(e.target.value)}
                                        placeholder="Адрес ПВЗ"
                                    />
                                </>
                            )}

                            <div className={styles.row2}>
                                <input
                                    className={styles.input}
                                    value={deliveryService}
                                    onChange={(e) => setDeliveryService(e.target.value)}
                                    placeholder="Служба доставки"
                                />
                                <input
                                    className={styles.input}
                                    value={deliveryPrice}
                                    onChange={(e) => setDeliveryPrice(e.target.value)}
                                    placeholder="Стоимость"
                                />
                            </div>

                            <input
                                className={styles.input}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Комментарий (необязательно)"
                            />

                            <button className={styles.btn} disabled={!canSubmit || loading}>
                                {loading ? 'Оформляем...' : 'Оформить заказ'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}