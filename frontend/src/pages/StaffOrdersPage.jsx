import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import styles from '../styles/StaffOrdersPage.module.css';
import {useAuth} from '../store/authContext';

const STATUS_TABS = [
    {key: 'new', label: 'Ожидают сборки'},
    {key: 'paid', label: 'Оплачены'},
    {key: 'shipped', label: 'Отгружены'},
    {key: 'completed', label: 'Доставлены'},
    {key: 'canceled', label: 'Отменены'},
    {key: 'all', label: 'Все'},
];

const statusLabel = (s) => {
    if (s === 'new') return 'Ожидает сборки';
    if (s === 'paid') return 'Оплачен';
    if (s === 'shipped') return 'Отгружен';
    if (s === 'completed') return 'Завершён';
    if (s === 'canceled') return 'Отменён';
    return s || '';
};

const deliveryLabel = (t) => {
    if (t === 'store_pickup') return 'Самовывоз';
    if (t === 'courier') return 'Курьер';
    if (t === 'pvz') return 'ПВЗ';
    return t || '';
};

const formatDateTime = (iso) => {
    try {
        const d = new Date(iso);
        return d.toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso || '';
    }
};

const money = (v) => {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
};

const itemsCount = (o) => {
    const items = Array.isArray(o?.items) ? o.items : [];
    return items.reduce((sum, i) => sum + Number(i?.quantity || 0), 0);
};

const firstItemName = (o) => {
    const items = Array.isArray(o?.items) ? o.items : [];
    return items[0]?.product_name_snapshot || '';
};

export default function StaffOrdersPage() {
    const {accessToken} = useAuth();

    const [activeStatus, setActiveStatus] = useState('new');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [orders, setOrders] = useState([]);

    const headers = useMemo(() => ({
        Authorization: `Bearer ${accessToken}`,
    }), [accessToken]);

    const loadOrders = async (statusKey) => {
        setLoading(true);
        setError('');

        try {
            const qs = statusKey && statusKey !== 'all' ? `?status=${encodeURIComponent(statusKey)}` : '';
            const res = await fetch(`/api/staff/orders/${qs}`, {
                method: 'GET',
                credentials: 'include',
                headers: {...headers},
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = err?.detail || 'Не удалось загрузить заказы';
                throw new Error(msg);
            }

            const data = await res.json();

            if (Array.isArray(data)) {
                setOrders(data);
            } else if (Array.isArray(data?.results)) {
                setOrders(data.results);
            } else {
                setOrders([]);
            }
        } catch (e) {
            setOrders([]);
            setError(e?.message || 'Ошибка');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!accessToken) return;
        loadOrders(activeStatus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, activeStatus]);

    const title = 'Заказы';
    const sub = activeStatus === 'new' ? 'Ожидают сборки' : statusLabel(activeStatus);

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.headLeft}>
                    <h1 className={styles.title}>{title}</h1>
                    <div className={styles.sub}>{sub}</div>
                </div>
                <div className={styles.headRight}>
                    <button
                        type="button"
                        className={styles.btnLight}
                        onClick={() => loadOrders(activeStatus)}
                        disabled={loading}
                    >
                        Обновить
                    </button>
                </div>
            </div>

            <div className={styles.tabs}>
                {STATUS_TABS.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        className={`${styles.tabBtn} ${activeStatus === t.key ? styles.tabBtnActive : ''}`}
                        onClick={() => setActiveStatus(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className={`${styles.notice} ${styles.noticeErr}`}>
                    <span>{error}</span>
                </div>
            )}

            <div className={styles.panel}>
                <div className={styles.tableHead}>
                    <div className={styles.colId}>№</div>
                    <div className={styles.colStatus}>Статус</div>
                    <div className={styles.colDate}>Дата</div>
                    <div className={styles.colItem}>Товар</div>
                    <div className={styles.colQty}>Кол-во</div>
                    <div className={styles.colSum}>Сумма</div>
                    <div className={styles.colDelivery}>Доставка</div>
                    <div className={styles.colAction}></div>
                </div>

                {loading ? (
                    <div className={styles.skeleton}>Загрузка…</div>
                ) : orders.length === 0 ? (
                    <div className={styles.empty}>Заказов нет</div>
                ) : (
                    <div className={styles.tableBody}>
                        {orders.map(o => (
                            <div key={o.id} className={styles.row}>
                                <div className={styles.colId}>
                                    <span className={styles.idValue}>{o.id}</span>
                                </div>

                                <div className={styles.colStatus}>
                                    <span className={`${styles.badge} ${styles[`badge_${o.status}`] || ''}`}>
                                        {statusLabel(o.status)}
                                    </span>
                                </div>

                                <div className={styles.colDate}>
                                    <span className={styles.muted}>{formatDateTime(o.created_at)}</span>
                                </div>

                                <div className={styles.colItem} title={firstItemName(o)}>
                                    <span className={styles.itemName}>{firstItemName(o)}</span>
                                </div>

                                <div className={styles.colQty}>
                                    <span className={styles.qty}>{itemsCount(o)}</span>
                                </div>

                                <div className={styles.colSum}>
                                    <span className={styles.sum}>{money(o.total_amount)} ₽</span>
                                </div>

                                <div className={styles.colDelivery}>
                                    <div className={styles.deliveryBlock}>
                                        <div className={styles.deliveryType}>{deliveryLabel(o.delivery_type)}</div>
                                        {o.delivery_service ? (
                                            <div className={styles.deliveryMeta}>{o.delivery_service}</div>
                                        ) : (
                                            <div className={styles.deliveryMeta}>—</div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.colAction}>
                                    <Link className={styles.linkBtn} to={`/staff/orders/${o.id}`}>
                                        Открыть
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}