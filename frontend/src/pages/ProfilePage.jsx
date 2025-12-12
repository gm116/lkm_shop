import {useEffect, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import {getMyOrders} from '../api/ordersApi';
import styles from '../styles/ProfilePage.module.css';

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function ProfilePage() {
    const location = useLocation();
    const {isAuthenticated, accessToken, user} = useAuth();

    const [orderId, setOrderId] = useState(null);

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (location.state?.orderId) {
            setOrderId(location.state.orderId);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) return;

        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await getMyOrders(accessToken);
                setOrders(Array.isArray(data) ? data : []);
            } catch (e) {
                setError(e.message || 'Ошибка загрузки заказов');
            } finally {
                setLoading(false);
            }
        })();
    }, [isAuthenticated, accessToken]);

    const hasOrders = orders.length > 0;

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Профиль</h2>
                <div className={styles.card}>Нужно войти</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Профиль</h2>

            {orderId && (
                <div className={styles.success}>
                    Заказ <strong>№{orderId}</strong> успешно оформлен
                </div>
            )}

            <div className={styles.card}>
                <div className={styles.sectionTitle}>Пользователь</div>
                <div className={styles.userRow}>
                    <div className={styles.userLabel}>Логин</div>
                    <div className={styles.userValue}>{user?.username || '—'}</div>
                </div>
                <div className={styles.userRow}>
                    <div className={styles.userLabel}>Email</div>
                    <div className={styles.userValue}>{user?.email || '—'}</div>
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.sectionTitle}>Мои заказы</div>

                {loading && <div className={styles.note}>Загрузка...</div>}
                {error && <div className={styles.error}>{error}</div>}

                {!loading && !error && !hasOrders && (
                    <div className={styles.note}>Заказов пока нет</div>
                )}

                {!loading && !error && hasOrders && (
                    <div className={styles.ordersList}>
                        {orders.map(o => (
                            <div key={o.id} className={styles.orderCard}>
                                <div className={styles.orderTop}>
                                    <div className={styles.orderId}>Заказ №{o.id}</div>
                                    <div className={styles.orderStatus}>{o.status}</div>
                                </div>

                                <div className={styles.orderMeta}>
                                    <div>Дата: {formatDate(o.created_at)}</div>
                                    <div>Сумма: {Number(o.total_amount).toLocaleString()} ₽</div>
                                    <div>Доставка: {o.delivery_type}</div>
                                </div>

                                <div className={styles.orderItems}>
                                    {o.items.map(it => (
                                        <div key={it.id} className={styles.orderItemRow}>
                                            <div className={styles.orderItemName}>{it.product_name_snapshot}</div>
                                            <div className={styles.orderItemRight}>
                                                <span>{it.quantity} шт</span>
                                                <span>{(Number(it.price_snapshot) * it.quantity).toLocaleString()} ₽</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}