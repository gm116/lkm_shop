import {useEffect, useMemo, useState, useRef, useCallback} from 'react';
import {Link, useParams} from 'react-router-dom';
import styles from '../styles/StaffOrderPage.module.css';
import {useAuth} from '../store/authContext';

const STATUSES = ['new', 'paid', 'shipped', 'completed', 'canceled'];

function statusLabel(s) {
    if (s === 'new') return 'Ожидает сборки';
    if (s === 'paid') return 'Оплачен';
    if (s === 'shipped') return 'Отгружен';
    if (s === 'completed') return 'Доставлен';
    if (s === 'canceled') return 'Отменён';
    return s || '';
}

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

function itemName(it) {
    return it?.product_name_snapshot || it?.product_name || it?.name || '';
}

function itemProductId(it) {
    return it?.product_id || it?.product || it?.id || null;
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

function itemImage(it, productImageMap) {
    const direct =
        it?.image_url_snapshot ||
        it?.product_image_snapshot ||
        it?.image_url ||
        it?.image ||
        '';

    if (direct) return direct;

    const pid = itemProductId(it);
    if (!pid) return '';

    return productImageMap.get(String(pid)) || '';
}

function deliveryLabel(type) {
    if (type === 'store_pickup') return 'Самовывоз';
    if (type === 'courier') return 'Курьер';
    if (type === 'pvz') return 'ПВЗ';
    return type || '';
}

export default function StaffOrderPage() {
    const {id} = useParams();
    const {authFetch} = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [order, setOrder] = useState(null);

    const [nextStatus, setNextStatus] = useState('new');

    const urlGet = useMemo(() => `/api/staff/orders/${id}/`, [id]);
    const urlStatus = useMemo(() => `/api/staff/orders/${id}/status/`, [id]);

    // кэш картинок по product_id (строка → url)
    const [productImageMap, setProductImageMap] = useState(() => new Map());
    const inFlightRef = useRef(new Set());

    const load = useCallback(async () => {
        setError('');
        setLoading(true);
        try {
            const res = await authFetch(urlGet, {method: 'GET'});
            if (!res.ok) {
                const data = await readJsonSafe(res);
                throw new Error(data?.detail || 'Не удалось загрузить заказ');
            }
            const data = await readJsonSafe(res);
            setOrder(data);
            setNextStatus(data?.status || 'new');
        } catch (e) {
            setOrder(null);
            setError(e?.message || 'Ошибка');
        } finally {
            setLoading(false);
        }
    }, [authFetch, urlGet]);

    useEffect(() => {
        load();
    }, [load]);

    // подтягиваем картинки для product_id, которых нет в кэше
    useEffect(() => {
        const items = Array.isArray(order?.items) ? order.items : [];
        if (!items.length) return;

        const ids = new Set();

        for (const it of items) {
            const alreadyInItem =
                it?.image_url_snapshot ||
                it?.product_image_snapshot ||
                it?.image_url ||
                it?.image;

            if (alreadyInItem) continue;

            const pid = itemProductId(it);
            if (!pid) continue;

            const key = String(pid);
            if (productImageMap.has(key)) continue;
            if (inFlightRef.current.has(key)) continue;

            ids.add(key);
        }

        if (ids.size === 0) return;

        let cancelled = false;

        const fetchOne = async (key) => {
            inFlightRef.current.add(key);
            try {
                // ВАЖНО: у тебя в urls это /api/catalog/products/<pk>/
                const res = await authFetch(`/api/catalog/products/${key}/`, {method: 'GET'});
                if (!res.ok) return;

                const data = await readJsonSafe(res);

                // твой ProductDetailSerializer возвращает images: [url, ...]
                const url =
                    (Array.isArray(data?.images) && data.images[0]) ||
                    data?.image ||
                    data?.image_url ||
                    '';

                if (!cancelled && url) {
                    setProductImageMap(prev => {
                        const next = new Map(prev);
                        next.set(key, url);
                        return next;
                    });
                }
            } finally {
                inFlightRef.current.delete(key);
            }
        };

        const run = async () => {
            const list = Array.from(ids);
            const CONCURRENCY = 6;

            for (let i = 0; i < list.length; i += CONCURRENCY) {
                const chunk = list.slice(i, i + CONCURRENCY);
                await Promise.all(chunk.map(fetchOne));
                if (cancelled) break;
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [order, authFetch, productImageMap]);

    const patchStatus = async () => {
        const res = await authFetch(urlStatus, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: nextStatus}),
        });
        return res;
    };

    const fallbackStatus = async () => {
        let res = await authFetch(urlStatus, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: nextStatus}),
        });
        if (res.status !== 405) return res;

        res = await authFetch(urlStatus, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status: nextStatus}),
        });
        return res;
    };

    const saveStatus = async () => {
        if (!order) return;
        if (nextStatus === order.status) return;

        setError('');
        setSaving(true);

        try {
            let res = await patchStatus();
            if (res.status === 405) {
                res = await fallbackStatus();
            }

            if (!res.ok) {
                const data = await readJsonSafe(res);
                throw new Error(data?.detail || 'Не удалось обновить статус');
            }

            const updated = await readJsonSafe(res);
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
    const itemsTotal = (order?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0);

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.head}>
                    <div className={styles.headLeft}>
                        <h1 className={styles.title}>Заказ #{id}</h1>
                        <div className={styles.sub}>
                            {order?.created_at ? fmtDateTime(order.created_at) : ''}
                        </div>
                        <div className={styles.heroStats}>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{itemsTotal}</span>
                                <span className={styles.heroStatLabel}>товаров</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{fmtMoney(order?.total_amount || 0)} ₽</span>
                                <span className={styles.heroStatLabel}>сумма</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{deliveryLabel(order?.delivery_type)}</span>
                                <span className={styles.heroStatLabel}>доставка</span>
                            </div>
                        </div>
                    </div>
                    <div className={styles.headRight}>
                        <Link to="/staff/orders" className={styles.btnLight}>Назад</Link>
                    </div>
                </div>

                {error ? <div className={styles.error}>{error}</div> : null}

                {loading ? (
                    <div className={styles.loadingGrid}>
                        <div className={styles.skeletonCard}/>
                        <div className={styles.skeletonCard}/>
                        <div className={styles.skeletonCardWide}/>
                    </div>
                ) : !order ? (
                    <div className={styles.empty}>Заказ не найден</div>
                ) : (
                    <>
                        <div className={styles.grid}>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <div className={styles.cardTitle}>Статус</div>
                                    <span
                                        className={`${styles.statusPill} ${styles[`status_${safeStr(order.status)}`] || ''}`}>
                                        {statusLabel(order.status)}
                                    </span>
                                </div>

                                <div className={styles.statusRow}>
                                    <select
                                        className={styles.select}
                                        value={nextStatus}
                                        onChange={(e) => setNextStatus(e.target.value)}
                                    >
                                        {STATUSES.map(s => (
                                            <option key={s} value={s}>{statusLabel(s)}</option>
                                        ))}
                                    </select>

                                    <button
                                        className={styles.btnPrimary}
                                        onClick={saveStatus}
                                        disabled={saving || nextStatus === order.status}
                                    >
                                        {saving ? 'Сохраняю…' : 'Сохранить'}
                                    </button>
                                </div>

                                <div className={styles.statusMeta}>
                                    <div className={styles.metaText}>
                                        Сумма: {fmtMoney(order.total_amount)} ₽
                                    </div>
                                    <div className={styles.metaTextMuted}>
                                        Товаров: {itemsTotal}
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
                                    <div className={styles.v}>{deliveryLabel(order.delivery_type)}</div>

                                    <div className={styles.k}>Служба</div>
                                    <div className={styles.v}>{safeStr(order.delivery_service) || '—'}</div>

                                    <div className={styles.k}>Город</div>
                                    <div className={styles.v}>{safeStr(order.delivery_city) || '—'}</div>

                                    <div className={styles.k}>Адрес</div>
                                    <div className={styles.v}>{safeStr(order.delivery_address_text) || '—'}</div>
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
                                {(order.items || []).map(it => {
                                    const img = itemImage(it, productImageMap);
                                    const name = itemName(it);

                                    return (
                                        <div className={styles.itemRow} key={it.id}>
                                            <div className={styles.itemLeft}>
                                                <div className={styles.itemMedia}>
                                                    {img ? (
                                                        <img className={styles.itemImg} src={img} alt={name}/>
                                                    ) : (
                                                        <div className={styles.itemImgPh}/>
                                                    )}
                                                </div>

                                                <div className={styles.itemInfo}>
                                                    <div className={styles.itemName}>{name}</div>
                                                    <div className={styles.itemSub}>
                                                        #{safeStr(itemProductId(it))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.itemRight}>
                                                <div className={styles.itemQty}>{safeStr(it.quantity)} шт</div>
                                                <div className={styles.itemPrice}>{fmtMoney(it.price_snapshot)} ₽</div>
                                            </div>
                                        </div>
                                    );
                                })}
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
        </div>
    );
}
