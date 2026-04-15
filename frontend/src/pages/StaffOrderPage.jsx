import {useEffect, useMemo, useState, useRef, useCallback} from 'react';
import {Link, useLocation, useParams, useSearchParams} from 'react-router-dom';
import styles from '../styles/StaffOrderPage.module.css';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';

const STATUS_SEQUENCE = ['new', 'paid', 'shipped', 'completed'];
const STATUS_LABELS = {
    new: 'Ожидает оплаты',
    paid: 'К сборке',
    shipped: 'Отгружен',
    completed: 'Доставлен',
    canceled: 'Отменен',
};

const NEXT_STATUS = {
    new: 'paid',
    paid: 'shipped',
    shipped: 'completed',
};

const DELIVERY_SERVICE_LABELS = {
    ozon: 'Ozon Доставка',
    kit: 'КИТ',
    delovie_linii: 'Деловые линии',
    cdek: 'СДЭК',
};

function statusLabel(status) {
    return STATUS_LABELS[status] || status || '';
}

function fmtMoney(value) {
    const n = Number(value || 0);
    return n.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function safeStr(value) {
    return value == null ? '' : String(value);
}

function itemName(item) {
    return item?.product_name_snapshot || item?.product_name || item?.name || 'Товар';
}

function itemProductId(item) {
    return item?.product_id || item?.product || item?.id || null;
}

function itemImage(item, productImageMap) {
    const direct =
        item?.image_url_snapshot ||
        item?.product_image_snapshot ||
        item?.image_url ||
        item?.image ||
        '';

    if (direct) return direct;

    const productId = itemProductId(item);
    if (!productId) return '';

    return productImageMap.get(String(productId)) || '';
}

function deliveryLabel(type) {
    if (type === 'store_pickup') return 'Самовывоз';
    if (type === 'pvz') return 'ПВЗ';
    return type || '—';
}

function allowedStatuses(currentStatus) {
    if (!currentStatus) return STATUS_SEQUENCE;
    if (currentStatus === 'completed' || currentStatus === 'canceled') return [currentStatus];
    if (currentStatus === 'new') return ['new', 'paid', 'canceled'];
    if (currentStatus === 'paid') return ['paid', 'shipped', 'canceled'];
    if (currentStatus === 'shipped') return ['shipped', 'completed', 'canceled'];
    return [currentStatus];
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

function LoadingSkeleton() {
    return (
        <div className={styles.loadingLayout}>
            <div className={styles.skeletonHeader}/>
            <div className={styles.skeletonTall}/>
            <div className={styles.skeletonMedium}/>
            <div className={styles.skeletonMedium}/>
            <div className={styles.skeletonSide}/>
        </div>
    );
}

export default function StaffOrderPage() {
    const {id} = useParams();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    const {authFetch} = useAuth();
    const notify = useNotify();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [order, setOrder] = useState(null);
    const [nextStatus, setNextStatus] = useState('new');

    const [productImageMap, setProductImageMap] = useState(() => new Map());
    const inFlightRef = useRef(new Set());

    const urlGet = useMemo(() => `/api/staff/orders/${id}/`, [id]);
    const urlStatus = useMemo(() => `/api/staff/orders/${id}/status/`, [id]);

    const backTo = searchParams.get('back') || location.state?.backTo || '/staff/orders';

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    const loadOrder = useCallback(async () => {
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
        loadOrder();
    }, [loadOrder]);

    const orderItems = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);

    useEffect(() => {
        if (!orderItems.length) return;

        const ids = new Set();
        for (const item of orderItems) {
            const hasImage =
                item?.image_url_snapshot ||
                item?.product_image_snapshot ||
                item?.image_url ||
                item?.image;

            if (hasImage) continue;

            const productId = itemProductId(item);
            if (!productId) continue;

            const key = String(productId);
            if (productImageMap.has(key)) continue;
            if (inFlightRef.current.has(key)) continue;

            ids.add(key);
        }

        if (!ids.size) return;

        let cancelled = false;

        const fetchOne = async (key) => {
            inFlightRef.current.add(key);
            try {
                const res = await authFetch(`/api/catalog/products/${key}/`, {method: 'GET'});
                if (!res.ok) return;

                const data = await readJsonSafe(res);
                const imageUrl =
                    (Array.isArray(data?.images) && data.images[0]) ||
                    data?.image ||
                    data?.image_url ||
                    '';

                if (!cancelled && imageUrl) {
                    setProductImageMap((prev) => {
                        const next = new Map(prev);
                        next.set(key, imageUrl);
                        return next;
                    });
                }
            } catch {
                // ignore
            } finally {
                inFlightRef.current.delete(key);
            }
        };

        const run = async () => {
            const list = Array.from(ids);
            const concurrency = 6;

            for (let i = 0; i < list.length; i += concurrency) {
                const chunk = list.slice(i, i + concurrency);
                await Promise.allSettled(chunk.map(fetchOne));
                if (cancelled) break;
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [orderItems, authFetch, productImageMap]);

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

        if (nextStatus === order.status) {
            notify.info('Статус уже выбран');
            return;
        }

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
                notify.success(`Статус обновлен: ${statusLabel(updated.status || nextStatus)}`);
            } else {
                await loadOrder();
                notify.success('Статус обновлен');
            }
        } catch (e) {
            setError(e?.message || 'Ошибка');
        } finally {
            setSaving(false);
        }
    };

    const itemsAmount = useMemo(
        () => orderItems.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
        [orderItems],
    );

    const canChangeStatus = !!order && order.status !== 'completed' && order.status !== 'canceled';
    const statusOptions = useMemo(() => allowedStatuses(order?.status), [order?.status]);
    const suggestedNext = NEXT_STATUS[order?.status] || '';

    const hasContacts = Boolean(safeStr(order?.customer_name) && safeStr(order?.customer_phone));

    const pickupName = order?.pickup_point_data?.name || '';
    const pickupAddress = order?.pickup_point_data?.address || '';

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <header className={styles.header}>
                    <div className={styles.headerMain}>
                        <div className={styles.titleRow}>
                            <h1 className={styles.title}>Сборка заказа #{id}</h1>
                            {order ? (
                                <span className={`${styles.statusBadge} ${styles[`statusTone_${safeStr(order.status)}`] || ''}`}>
                                    {statusLabel(order.status)}
                                </span>
                            ) : null}
                        </div>
                        <div className={styles.metaRow}>
                            <span className={styles.metaItem}>Создан: {fmtDateTime(order?.created_at)}</span>
                            <span className={styles.metaItem}>Обновлен: {fmtDateTime(order?.updated_at)}</span>
                            <span className={styles.metaItem}>Доставка: {deliveryLabel(order?.delivery_type)}</span>
                        </div>
                    </div>

                    <div className={styles.headerStats}>
                        <div className={styles.statCard}>
                            <div className={styles.statValue}>{itemsAmount}</div>
                            <div className={styles.statLabel}>товаров</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statValue}>{fmtMoney(order?.total_amount)} ₽</div>
                            <div className={styles.statLabel}>сумма заказа</div>
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        <button className={styles.btnGhost} type="button" onClick={loadOrder} disabled={loading}>
                            Обновить
                        </button>
                        <Link to={backTo} className={styles.btnLight}>Назад к списку</Link>
                    </div>
                </header>

                {error ? <div className={styles.error}>{error}</div> : null}

                {loading ? (
                    <LoadingSkeleton/>
                ) : !order ? (
                    <div className={styles.empty}>Заказ не найден</div>
                ) : (
                    <div className={styles.layout}>
                        <main className={styles.mainCol}>
                            <section className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <h2 className={styles.cardTitle}>Позиции к сборке</h2>
                                        <p className={styles.cardSub}>Состав заказа и количество по каждой позиции</p>
                                    </div>
                                </div>

                                <div className={styles.itemsList}>
                                    {orderItems.map((item) => {
                                        const imageUrl = itemImage(item, productImageMap);
                                        const name = itemName(item);
                                        const productId = itemProductId(item);
                                        const maxQty = Number(item?.quantity || 0);
                                        const rowTotal = maxQty * Number(item?.price_snapshot || 0);
                                        const productUrl = productId ? `/product/${productId}` : null;

                                        return (
                                            <article className={styles.itemRow} key={item.id}>
                                                <div className={styles.itemMedia}>
                                                    {productUrl ? (
                                                        <Link to={productUrl} target="_blank" rel="noreferrer">
                                                            {imageUrl ? (
                                                                <img className={styles.itemImg} src={imageUrl} alt={name}/>
                                                            ) : (
                                                                <div className={styles.itemImgPlaceholder}>Фото</div>
                                                            )}
                                                        </Link>
                                                    ) : imageUrl ? (
                                                        <img className={styles.itemImg} src={imageUrl} alt={name}/>
                                                    ) : (
                                                        <div className={styles.itemImgPlaceholder}>Фото</div>
                                                    )}
                                                </div>

                                                <div className={styles.itemBody}>
                                                    {productUrl ? (
                                                        <Link to={productUrl} target="_blank" rel="noreferrer" className={styles.itemName}>{name}</Link>
                                                    ) : (
                                                        <div className={styles.itemName}>{name}</div>
                                                    )}
                                                    <div className={styles.itemMeta}>SKU/ID: #{safeStr(productId) || '—'} • {fmtMoney(item.price_snapshot)} ₽</div>
                                                </div>

                                                <div className={styles.itemQtyBlock}>
                                                    <div className={styles.itemQtyValue}>{maxQty} шт.</div>
                                                </div>

                                                <div className={styles.itemTotal}>{fmtMoney(rowTotal)} ₽</div>
                                            </article>
                                        );
                                    })}
                                </div>

                                <div className={styles.totalRow}>
                                    <span>Итого по заказу</span>
                                    <span>{fmtMoney(order.total_amount)} ₽</span>
                                </div>
                            </section>
                        </main>

                        <section className={styles.middleCol}>
                            <section className={styles.card}>
                                <h2 className={styles.cardTitle}>Клиент</h2>
                                <div className={styles.kvGrid}>
                                    <div className={styles.key}>Имя</div>
                                    <div className={styles.val}>{safeStr(order.customer_name) || '—'}</div>
                                    <div className={styles.key}>Телефон</div>
                                    <div className={styles.val}>{safeStr(order.customer_phone) || '—'}</div>
                                    <div className={styles.key}>Email</div>
                                    <div className={styles.val}>{safeStr(order.customer_email) || '—'}</div>
                                </div>
                            </section>

                            <section className={styles.card}>
                                <h2 className={styles.cardTitle}>Доставка</h2>
                                <div className={styles.kvGrid}>
                                    <div className={styles.key}>Формат</div>
                                    <div className={styles.val}>{deliveryLabel(order.delivery_type)}</div>
                                    <div className={styles.key}>Служба</div>
                                    <div className={styles.val}>{DELIVERY_SERVICE_LABELS[order.delivery_service] || safeStr(order.delivery_service) || '—'}</div>
                                    <div className={styles.key}>Город</div>
                                    <div className={styles.val}>{safeStr(order.delivery_city) || '—'}</div>
                                    <div className={styles.key}>Адрес</div>
                                    <div className={styles.val}>{safeStr(order.delivery_address_text) || '—'}</div>
                                </div>

                                {(pickupName || pickupAddress) ? (
                                    <div className={styles.pickupBlock}>
                                        <div className={styles.pickupTitle}>Пункт выдачи</div>
                                        {pickupName ? <div className={styles.pickupLine}>{pickupName}</div> : null}
                                        {pickupAddress ? <div className={styles.pickupLine}>{pickupAddress}</div> : null}
                                    </div>
                                ) : null}
                            </section>

                            <section className={styles.card}>
                                <h2 className={styles.cardTitle}>Комментарий</h2>
                                <p className={styles.commentText}>{safeStr(order.comment) || 'Комментарий не указан'}</p>
                            </section>
                        </section>

                        <aside className={styles.sideCol}>
                            <section className={`${styles.card} ${styles.statusCard}`}>
                                <h2 className={styles.cardTitle}>Статус заказа</h2>

                                <div className={styles.timeline}>
                                    {STATUS_SEQUENCE.map((status, index) => {
                                        const currentIndex = STATUS_SEQUENCE.indexOf(order.status);
                                        const done = currentIndex >= index && order.status !== 'canceled';
                                        const isCurrent = order.status === status;

                                        return (
                                            <div className={styles.timelineRow} key={status}>
                                                <span className={`${styles.timelineDot} ${done ? styles.timelineDotDone : ''} ${isCurrent ? styles.timelineDotCurrent : ''}`}/>
                                                <span className={`${styles.timelineLine} ${done ? styles.timelineLineDone : ''}`}/>
                                                <span className={`${styles.timelineLabel} ${isCurrent ? styles.timelineLabelCurrent : ''}`}>
                                                    {statusLabel(status)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className={styles.statusControls}>
                                    <label className={styles.label}>Изменить статус</label>
                                    <select
                                        className={styles.select}
                                        value={nextStatus}
                                        onChange={(e) => setNextStatus(e.target.value)}
                                        disabled={!canChangeStatus || saving}
                                    >
                                        {statusOptions.map((status) => (
                                            <option key={status} value={status}>{statusLabel(status)}</option>
                                        ))}
                                    </select>

                                    {canChangeStatus && suggestedNext ? (
                                        <button
                                            className={styles.btnGhost}
                                            type="button"
                                            onClick={() => setNextStatus(suggestedNext)}
                                            disabled={saving}
                                        >
                                            Следующий этап: {statusLabel(suggestedNext)}
                                        </button>
                                    ) : null}

                                    <button
                                        className={styles.btnPrimary}
                                        type="button"
                                        onClick={saveStatus}
                                        disabled={!canChangeStatus || saving || nextStatus === order.status}
                                    >
                                        {saving ? 'Сохраняю…' : 'Сохранить статус'}
                                    </button>

                                    {!canChangeStatus ? (
                                        <div className={styles.statusHint}>У этого заказа статус больше не меняется.</div>
                                    ) : null}
                                </div>
                            </section>

                            <section className={styles.card}>
                                <h2 className={styles.cardTitle}>Контроль перед сменой статуса</h2>
                                <div className={styles.checkList}>
                                    <div className={styles.checkItem}>
                                        <span className={`${styles.checkDot} ${order.payment_succeeded ? styles.checkDotOk : ''}`}/>
                                        <span className={styles.checkText}>Оплата подтверждена</span>
                                    </div>
                                    <div className={styles.checkItem}>
                                        <span className={`${styles.checkDot} ${hasContacts ? styles.checkDotOk : ''}`}/>
                                        <span className={styles.checkText}>Контакты клиента заполнены</span>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                )}
            </div>
        </div>
    );
}
