import {useEffect, useMemo, useState, useCallback, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import styles from '../styles/StaffOrdersPage.module.css';
import {useAuth} from '../store/authContext';

const STATUS_TABS = [
    {key: 'new', label: 'Новые'},
    {key: 'paid', label: 'Оплачены'},
    {key: 'shipped', label: 'Отгружены'},
    {key: 'completed', label: 'Доставлены'},
    {key: 'canceled', label: 'Отменены'},
    {key: 'all', label: 'Все'},
];

const statusLabel = (s) => {
    if (s === 'new') return 'Новый';
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

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toDateInputValue(d) {
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
}

function parseISODateSafe(v) {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function itemName(it) {
    return it?.product_name_snapshot || it?.product_name || it?.name || '';
}

function itemProductId(it) {
    // у разных сериализаторов это может называться по-разному
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

// берём картинку из item если она вдруг есть,
// иначе из кэша по product_id
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

export default function StaffOrdersPage() {
    const {authFetch} = useAuth(); // важно: authFetch должен сам обновлять токены
    const navigate = useNavigate();

    const [activeStatus, setActiveStatus] = useState('new');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [orders, setOrders] = useState([]);

    // Даты: по умолчанию последние 30 дней
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return toDateInputValue(d);
    });
    const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));

    // Сортировка по дате
    const [dateSort, setDateSort] = useState('desc'); // desc = новые сверху, asc = старые сверху

    // кэш картинок по product_id (строка → url)
    const [productImageMap, setProductImageMap] = useState(() => new Map());
    const inFlightRef = useRef(new Set()); // чтобы не дёргать один и тот же product_id параллельно

    const loadOrders = useCallback(async (statusKey) => {
        setLoading(true);
        setError('');

        try {
            const qs = statusKey && statusKey !== 'all' ? `?status=${encodeURIComponent(statusKey)}` : '';
            const res = await authFetch(`/api/staff/orders/${qs}`, {method: 'GET'});

            if (!res.ok) {
                const err = await readJsonSafe(res);
                throw new Error(err?.detail || 'Не удалось загрузить заказы');
            }

            const data = await readJsonSafe(res);

            if (Array.isArray(data)) setOrders(data);
            else if (Array.isArray(data?.results)) setOrders(data.results);
            else setOrders([]);
        } catch (e) {
            setOrders([]);
            setError(e?.message || 'Ошибка');
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        loadOrders(activeStatus);
    }, [activeStatus, loadOrders]);

    // подтягиваем картинки для всех product_id, которых нет в кэше
    useEffect(() => {
        const ids = new Set();

        for (const o of (orders || [])) {
            const items = Array.isArray(o?.items) ? o.items : [];
            for (const it of items) {
                // если картинка уже есть прямо в item — не трогаем
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
        }

        if (ids.size === 0) return;

        let cancelled = false;

        const fetchOne = async (key) => {
            inFlightRef.current.add(key);
            try {
                const res = await authFetch(`/api/catalog/products/${key}/`, {method: 'GET'});
                if (!res.ok) return;

                const data = await readJsonSafe(res);
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

        // без фанатизма — параллельно, но не бесконечно
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
    }, [orders, authFetch, productImageMap]);

    const filteredSortedOrders = useMemo(() => {
        const fromD = parseISODateSafe(dateFrom);
        const toD = parseISODateSafe(dateTo);

        const from = fromD ? startOfDay(fromD) : null;
        const to = toD ? endOfDay(toD) : null;

        const arr = Array.isArray(orders) ? [...orders] : [];

        const filtered = arr.filter(o => {
            const d = parseISODateSafe(o?.created_at);
            if (!d) return true;

            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const da = parseISODateSafe(a?.created_at)?.getTime() || 0;
            const db = parseISODateSafe(b?.created_at)?.getTime() || 0;
            return dateSort === 'asc' ? (da - db) : (db - da);
        });

        return filtered;
    }, [orders, dateFrom, dateTo, dateSort]);

    const title = 'Заказы';
    const sub = activeStatus === 'new' ? 'Новые' : statusLabel(activeStatus);

    const openOrder = (id) => {
        if (!id) return;
        navigate(`/staff/orders/${id}`);
    };

    const onRowKeyDown = (e, id) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openOrder(id);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.head}>
                    <div className={styles.headLeft}>
                        <h1 className={styles.title}>{title}</h1>
                        <div className={styles.sub}>{sub}</div>
                    </div>

                    <div className={styles.headRight}>
                        <div className={styles.filters}>
                            <div className={styles.filterGroup}>
                                <span className={styles.filterLabel}>Период</span>
                                <div className={styles.dateRow}>
                                    <input
                                        className={styles.dateInput}
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                    />
                                    <span className={styles.dateDash}>—</span>
                                    <input
                                        className={styles.dateInput}
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className={styles.filterGroup}>
                                <span className={styles.filterLabel}>Сортировка</span>
                                <button
                                    type="button"
                                    className={styles.btnLight}
                                    onClick={() => setDateSort(s => (s === 'desc' ? 'asc' : 'desc'))}
                                >
                                    {dateSort === 'desc' ? 'Сначала новые' : 'Сначала старые'}
                                </button>
                            </div>

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
                <div className={styles.table}>
                    <div className={styles.tableHead}>
                        <div className={styles.colId}>№</div>
                        <div className={styles.colStatus}>Статус</div>
                        <div className={styles.colDate}>Дата</div>
                        <div className={styles.colItems}>Позиции</div>
                        <div className={styles.colQty}>Кол-во</div>
                        <div className={styles.colSum}>Сумма</div>
                        <div className={styles.colDelivery}>Доставка</div>
                    </div>

                    {loading ? (
                        <div className={styles.skeleton}>Загрузка…</div>
                    ) : filteredSortedOrders.length === 0 ? (
                        <div className={styles.empty}>Заказов нет</div>
                    ) : (
                        <div className={styles.tableBody}>
                            {filteredSortedOrders.map(o => {
                                const items = Array.isArray(o?.items) ? o.items : [];
                                return (
                                    <div
                                        key={o.id}
                                        className={styles.row}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => openOrder(o.id)}
                                        onKeyDown={(e) => onRowKeyDown(e, o.id)}
                                        title="Открыть заказ"
                                    >
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

                                        <div className={styles.colItems}>
                                            <div className={styles.itemsWrap}>
                                                {items.length === 0 ? (
                                                    <span className={styles.itemsEmpty}>—</span>
                                                ) : (
                                                    items.map((it, idx) => {
                                                        const img = itemImage(it, productImageMap);
                                                        const name = itemName(it);
                                                        const qty = Number(it?.quantity || 0);

                                                        return (
                                                            <div
                                                                key={it.id || `${o.id}_${idx}`}
                                                                className={styles.itemChip}
                                                                title={name}
                                                            >
                                                                {img ? (
                                                                    <img
                                                                        className={styles.itemImg}
                                                                        src={img}
                                                                        alt={name}
                                                                    />
                                                                ) : (
                                                                    <div className={styles.itemImgPh}/>
                                                                )}

                                                                <div className={styles.itemText}>
                                                                    <span className={styles.itemTitle}>{name || '—'}</span>
                                                                    <span className={styles.itemMeta}>× {qty}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div className={styles.colQty}>
                                            <span className={styles.qty}>{itemsCount(o)}</span>
                                        </div>

                                        <div className={styles.colSum}>
                                            <span className={styles.sum}>{money(o.total_amount)} ₽</span>
                                        </div>

                                        <div className={styles.colDelivery}>
                                            <div className={styles.deliveryBlock}>
                                                <div className={styles.deliveryType}>
                                                    {deliveryLabel(o.delivery_type)}
                                                </div>
                                                {o.delivery_service ? (
                                                    <div className={styles.deliveryMeta}>{o.delivery_service}</div>
                                                ) : (
                                                    <div className={styles.deliveryMeta}>—</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}