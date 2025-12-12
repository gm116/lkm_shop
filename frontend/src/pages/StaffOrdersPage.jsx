import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import {getMyPermissions, staffGetOrders} from '../api/staffOrdersApi';
import styles from '../styles/StaffOrdersPage.module.css';

function canSeeStaff(perm) {
    if (!perm) return false;
    if (perm.is_superuser || perm.is_staff) return true;
    return Array.isArray(perm.groups) && perm.groups.includes('warehouse');
}

export default function StaffOrdersPage() {
    const {isAuthenticated, accessToken} = useAuth();

    const [perm, setPerm] = useState(null);
    const [orders, setOrders] = useState([]);

    const [statusFilter, setStatusFilter] = useState('new');
    const [q, setQ] = useState('');
    const [deliveryType, setDeliveryType] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const allowed = useMemo(() => canSeeStaff(perm), [perm]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) return;

        (async () => {
            try {
                const p = await getMyPermissions(accessToken);
                setPerm(p);
            } catch (e) {
                setPerm(null);
            }
        })();
    }, [isAuthenticated, accessToken]);

    const load = async () => {
        if (!accessToken) return;
        setLoading(true);
        setError('');
        try {
            const data = await staffGetOrders(accessToken, {
                status: statusFilter,
                delivery_type: deliveryType,
                q: q.trim(),
            });
            setOrders(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message || 'Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!allowed) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed]);

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказы</h2>
                <div className={styles.card}>Нужно войти</div>
            </div>
        );
    }

    if (!perm) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказы</h2>
                <div className={styles.card}>Проверяем доступ...</div>
            </div>
        );
    }

    if (!allowed) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказы</h2>
                <div className={styles.card}>Нет доступа</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.top}>
                <h2 className={styles.title}>Staff: Заказы</h2>
                <button className={styles.btn} type="button" onClick={load} disabled={loading}>
                    Обновить
                </button>
            </div>

            <div className={styles.filters}>
                <select className={styles.select} value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="new">new</option>
                    <option value="paid">paid</option>
                    <option value="shipped">shipped</option>
                    <option value="completed">completed</option>
                    <option value="canceled">canceled</option>
                </select>

                <select className={styles.select} value={deliveryType}
                        onChange={(e) => setDeliveryType(e.target.value)}>
                    <option value="">all delivery</option>
                    <option value="pickup">pickup</option>
                    <option value="courier">courier</option>
                </select>

                <input
                    className={styles.input}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Поиск: №, имя, телефон, email"
                />

                <button className={styles.btn} type="button" onClick={load} disabled={loading}>
                    Найти
                </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.list}>
                {loading && <div className={styles.card}>Загрузка...</div>}

                {!loading && orders.length === 0 && (
                    <div className={styles.card}>Нет заказов</div>
                )}

                {!loading && orders.map(o => (
                    <Link key={o.id} to={`/staff/orders/${o.id}`} className={styles.orderCard}>
                        <div className={styles.orderTop}>
                            <div className={styles.orderId}>№{o.id}</div>
                            <div className={styles.orderStatus}>{o.status}</div>
                        </div>

                        <div className={styles.orderMeta}>
                            <span>{o.customer_name}</span>
                            <span>{o.customer_phone}</span>
                        </div>

                        <div className={styles.orderBottom}>
                            <span>{o.delivery_type}</span>
                            <span>{Number(o.total_amount).toLocaleString()} ₽</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}