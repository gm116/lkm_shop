import {useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import styles from '../styles/StaffOrderPage.module.css';
import {useAuth} from '../store/authContext';

const STATUSES = ['new', 'paid', 'shipped', 'completed', 'canceled'];

function fmtMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
}

function fmtDateTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function safeStr(v) {
    return v == null ? '' : String(v);
}

export default function StaffOrderPage() {
    const {id} = useParams();
    const {authFetch} = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [order, setOrder] = useState(null);

    const [nextStatus, setNextStatus] = useState('new');

    const url = useMemo(() => `/api/staff/orders/${id}/`, [id]);

    const load = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await authFetch(url, {method: 'GET'});
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.detail || 'Не удалось загрузить заказ');
            }
            const data = await res.json();
            setOrder(data);
            setNextStatus(data?.status || 'new');
        } catch (e) {
            setOrder(null);
            setError(e?.message || 'Ошибка');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    const saveStatus = async () => {
        if (!order) return;
        if (nextStatus === order.status) return;

        setError('');
        setSaving(true);
        try {
            const res = await authFetch(url, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({status: nextStatus}),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.detail || 'Не удалось обновить статус');
            }

            const updated = await res.json().catch(() => (null));
            if (updated) {
                setOrder(updated);
                setNextStatus(updated.status || nextStatus);
            } else {
                await load();
            }
        } catch (e) {
            setError(e?.message || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    const pickupAddress = order?.pickup_point_data?.address || '';
    const pickupName = order?.pickup_point_data?.name || '';

    return (
        <div className={styles.page}>
            <div className={styles.head}>
                <div className={styles.headLeft}>
                    <h1 className={styles.title}>Заказ #{id}</h1>
                    <div className={styles.sub}>{order?.created_at ? fmtDateTime(order.created_at) : ''}</div>
                </div>
                <div className={styles.headRight}>
                    <Link to="/staff/orders" className={styles.btnLight}>Назад</Link>
                </div>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}

            {loading ? (
                <div className={styles.skeleton}>Загрузка...</div>
            ) : !order ? (
                <div className={styles.empty}>Заказ не найден</div>
            ) : (
                <>
                    <div className={styles.grid}>
                        <div className={styles.card}>
                            <div className={styles.cardHead}>
                                <div className={styles.cardTitle}>Статус</div>
                            </div>

                            <div className={styles.statusRow}>
                                <select
                                    className={styles.select}
                                    value={nextStatus}
                                    onChange={(e) => setNextStatus(e.target.value)}
                                >
                                    {STATUSES.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>

                                <button
                                    className={styles.btnPrimary}
                                    onClick={saveStatus}
                                    disabled={saving || nextStatus === order.status}
                                >
                                    Сохранить
                                </button>
                            </div>

                            <div className={styles.statusMeta}>
                                <div className={styles.statusPillWrap}>
                                    <span
                                        className={`${styles.statusPill} ${styles[`status_${safeStr(order.status)}`] || ''}`}>
                                        {safeStr(order.status)}
                                    </span>
                                </div>
                                <div className={styles.metaText}>
                                    Сумма: {fmtMoney(order.total_amount)} ₽
                                </div>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={styles.cardHead}>
                                <div className={styles.cardTitle}>Клиент</div>
                            </div>

                            <div className={styles.kv}>
                                <div className={styles.k}>Имя</div>
                                <div className={styles.v}>{safeStr(order.customer_name)}</div>

                                <div className={styles.k}>Телефон</div>
                                <div className={styles.v}>{safeStr(order.customer_phone)}</div>

                                <div className={styles.k}>Email</div>
                                <div className={styles.v}>{safeStr(order.customer_email)}</div>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={styles.cardHead}>
                                <div className={styles.cardTitle}>Доставка</div>
                            </div>

                            <div className={styles.kv}>
                                <div className={styles.k}>Тип</div>
                                <div className={styles.v}>{safeStr(order.delivery_type)}</div>

                                <div className={styles.k}>Служба</div>
                                <div className={styles.v}>{safeStr(order.delivery_service)}</div>

                                <div className={styles.k}>Город</div>
                                <div className={styles.v}>{safeStr(order.delivery_city)}</div>

                                <div className={styles.k}>Адрес</div>
                                <div className={styles.v}>{safeStr(order.delivery_address_text)}</div>
                            </div>

                            {(pickupName || pickupAddress) ? (
                                <div className={styles.pickup}>
                                    <div className={styles.pickupTitle}>ПВЗ</div>
                                    {pickupName ? <div className={styles.pickupLine}>{pickupName}</div> : null}
                                    {pickupAddress ? <div className={styles.pickupLine}>{pickupAddress}</div> : null}
                                </div>
                            ) : null}

                            {order.comment ? (
                                <div className={styles.comment}>
                                    {safeStr(order.comment)}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHead}>
                            <div className={styles.cardTitle}>Состав заказа</div>
                        </div>

                        <div className={styles.items}>
                            {(order.items || []).map(it => (
                                <div className={styles.itemRow} key={it.id}>
                                    <div className={styles.itemLeft}>
                                        <div className={styles.itemName}>{safeStr(it.product_name_snapshot)}</div>
                                        <div className={styles.itemSub}>#{safeStr(it.product_id || it.product)}</div>
                                    </div>
                                    <div className={styles.itemRight}>
                                        <div className={styles.itemQty}>{safeStr(it.quantity)} шт</div>
                                        <div className={styles.itemPrice}>{fmtMoney(it.price_snapshot)} ₽</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.total}>
                            <div>Итого</div>
                            <div>{fmtMoney(order.total_amount)} ₽</div>
                        </div>
                    </div>

                    <div className={styles.footerMeta}>
                        <div>Создан: {fmtDateTime(order.created_at)}</div>
                        <div>Обновлён: {fmtDateTime(order.updated_at)}</div>
                    </div>
                </>
            )}
        </div>
    );
}