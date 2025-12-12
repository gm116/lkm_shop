import {useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import {getMyPermissions, staffGetOrderById, staffUpdateOrderStatus} from '../api/staffOrdersApi';
import styles from '../styles/StaffOrderPage.module.css';

function canSeeStaff(perm) {
    if (!perm) return false;
    if (perm.is_superuser || perm.is_staff) return true;
    return Array.isArray(perm.groups) && perm.groups.includes('warehouse');
}

export default function StaffOrderPage() {
    const {id} = useParams();
    const orderId = Number(id);

    const {isAuthenticated, accessToken} = useAuth();

    const [perm, setPerm] = useState(null);
    const [order, setOrder] = useState(null);

    const [statusValue, setStatusValue] = useState('new');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
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
            const data = await staffGetOrderById(accessToken, orderId);
            setOrder(data);
            setStatusValue(data.status);
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
    }, [allowed, orderId]);

    const saveStatus = async () => {
        if (!accessToken) return;
        setSaving(true);
        setError('');
        try {
            await staffUpdateOrderStatus(accessToken, orderId, statusValue);
            await load();
        } catch (e) {
            setError(e.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказ</h2>
                <div className={styles.card}>Нужно войти</div>
            </div>
        );
    }

    if (!perm) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказ</h2>
                <div className={styles.card}>Проверяем доступ...</div>
            </div>
        );
    }

    if (!allowed) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Staff: Заказ</h2>
                <div className={styles.card}>Нет доступа</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.top}>
                <h2 className={styles.title}>Заказ №{orderId}</h2>
                <Link to="/staff/orders" className={styles.back}>← К списку</Link>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {loading && <div className={styles.card}>Загрузка...</div>}

            {!loading && order && (
                <>
                    <div className={styles.card}>
                        <div className={styles.sectionTitle}>Статус</div>

                        <div className={styles.statusRow}>
                            <select
                                className={styles.select}
                                value={statusValue}
                                onChange={(e) => setStatusValue(e.target.value)}
                            >
                                <option value="new">new</option>
                                <option value="paid">paid</option>
                                <option value="shipped">shipped</option>
                                <option value="completed">completed</option>
                                <option value="canceled">canceled</option>
                            </select>

                            <button className={styles.btn} type="button" onClick={saveStatus} disabled={saving}>
                                {saving ? 'Сохраняем...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.sectionTitle}>Клиент</div>
                        <div className={styles.kv}>
                            <div className={styles.k}>Имя</div>
                            <div className={styles.v}>{order.customer_name}</div>
                            <div className={styles.k}>Телефон</div>
                            <div className={styles.v}>{order.customer_phone}</div>
                            <div className={styles.k}>Email</div>
                            <div className={styles.v}>{order.customer_email || '—'}</div>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.sectionTitle}>Доставка</div>
                        <div className={styles.kv}>
                            <div className={styles.k}>Тип</div>
                            <div className={styles.v}>{order.delivery_type}</div>
                            <div className={styles.k}>Город</div>
                            <div className={styles.v}>{order.delivery_city || '—'}</div>
                            <div className={styles.k}>Адрес</div>
                            <div className={styles.v}>{order.delivery_address_text || '—'}</div>
                            <div className={styles.k}>Сервис</div>
                            <div className={styles.v}>{order.delivery_service || '—'}</div>
                            <div className={styles.k}>Стоимость</div>
                            <div className={styles.v}>{Number(order.delivery_price || 0).toLocaleString()} ₽</div>
                        </div>

                        {order.pickup_point_data && (
                            <div className={styles.pickup}>
                                <div className={styles.sectionTitle}>ПВЗ</div>
                                <div className={styles.pickupText}>
                                    {order.pickup_point_data.name || '—'}<br/>
                                    {order.pickup_point_data.address || '—'}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.sectionTitle}>Позиции</div>
                        <div className={styles.items}>
                            {order.items.map(it => (
                                <div key={it.id} className={styles.itemRow}>
                                    <div className={styles.itemName}>{it.product_name_snapshot}</div>
                                    <div className={styles.itemRight}>
                                        <span>{it.quantity} шт</span>
                                        <span>{(Number(it.price_snapshot) * it.quantity).toLocaleString()} ₽</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.total}>
                            <span>Итого</span>
                            <span>{Number(order.total_amount).toLocaleString()} ₽</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}