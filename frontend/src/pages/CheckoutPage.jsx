import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';

import {useCart} from '../store/cartContext';
import {createOrder} from '../api/orders';
import styles from '../styles/CheckoutPage.module.css';

export default function CheckoutPage() {
    const navigate = useNavigate();
    const {cart, clearCart} = useCart();

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');

    const [deliveryType, setDeliveryType] = useState('pickup');
    const [deliveryCity, setDeliveryCity] = useState('');
    const [deliveryAddressText, setDeliveryAddressText] = useState('');

    const [pickupName, setPickupName] = useState('ПВЗ тест');
    const [pickupAddress, setPickupAddress] = useState('Москва, Тверская 1');

    const [comment, setComment] = useState('');
    const [deliveryPrice, setDeliveryPrice] = useState('300');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successOrderId, setSuccessOrderId] = useState(null);

    const total = useMemo(() => {
        return cart.reduce((sum, item) => sum + Number(item.price) * item.count, 0);
    }, [cart]);

    const canSubmit = cart.length > 0 && customerName.trim() && customerPhone.trim();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;

        setLoading(true);
        setError('');

        try {
            const payload = {
                customer_name: customerName.trim(),
                customer_phone: customerPhone.trim(),
                customer_email: customerEmail.trim(),

                delivery_type: deliveryType,
                delivery_city: deliveryCity.trim(),
                delivery_address_text: deliveryAddressText.trim(),

                pickup_point_data: deliveryType === 'pickup' ? {
                    id: 'ui_pvz_1',
                    name: pickupName.trim(),
                    address: pickupAddress.trim(),
                } : null,

                delivery_service: deliveryType === 'pickup' ? 'cdek' : '',
                delivery_price: deliveryPrice ? Number(deliveryPrice) : null,

                comment: comment.trim(),

                items: cart.map(item => ({
                    product_id: item.id,
                    quantity: item.count,
                })),
            };

            if (payload.pickup_point_data === null) {
                delete payload.pickup_point_data;
            }

            const res = await createOrder(payload);

            setSuccessOrderId(res.order_id);
            clearCart();
        } catch (err) {
            setError(err.message || 'Ошибка оформления заказа');
        } finally {
            setLoading(false);
        }
    };

    if (successOrderId) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Заказ оформлен</h2>
                <div>Номер заказа: <b>{successOrderId}</b></div>
                <div className={styles.successRow}>
                    <button className={styles.linkBtn} onClick={() => navigate('/catalog')}>
                        Вернуться в каталог
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Оформление заказа</h2>

            {cart.length === 0 && (
                <div className={styles.empty}>Корзина пуста</div>
            )}

            {error && (
                <div className={styles.error}>{error}</div>
            )}

            <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.block}>
                    <input
                        className={styles.input}
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Имя"
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
                </div>

                <div className={styles.radioRow}>
                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            checked={deliveryType === 'pickup'}
                            onChange={() => setDeliveryType('pickup')}
                        />
                        ПВЗ
                    </label>
                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            checked={deliveryType === 'courier'}
                            onChange={() => setDeliveryType('courier')}
                        />
                        Курьер
                    </label>
                </div>

                <div className={styles.block}>
                    <input
                        className={styles.input}
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        placeholder="Город"
                    />

                    {deliveryType === 'pickup' ? (
                        <>
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
                    ) : (
                        <input
                            className={styles.input}
                            value={deliveryAddressText}
                            onChange={(e) => setDeliveryAddressText(e.target.value)}
                            placeholder="Адрес доставки"
                        />
                    )}

                    <input
                        className={styles.input}
                        value={deliveryPrice}
                        onChange={(e) => setDeliveryPrice(e.target.value)}
                        placeholder="Стоимость доставки"
                    />

                    <input
                        className={styles.input}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Комментарий"
                    />
                </div>

                <div className={styles.total}>
                    Итого товаров: <b>{total.toLocaleString()} ₽</b>
                </div>

                <button className={styles.btn} type="submit" disabled={!canSubmit || loading}>
                    {loading ? 'Оформляем...' : 'Оформить заказ'}
                </button>
            </form>
        </div>
    );
}