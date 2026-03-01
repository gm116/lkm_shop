import {useEffect, useMemo, useState, useCallback, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import styles from '../styles/StaffOrdersPage.module.css';
import {useAuth} from '../store/authContext';

const ORDER_SKELETON_COUNT = 6;
const PERIOD_PRESETS = [
    {key: 'week', label: 'За неделю', days: 7},
    {key: 'month', label: 'За месяц', days: 30},
    {key: 'quarter', label: 'За 3 месяца', days: 90},
    {key: 'half_year', label: 'За 6 месяцев', days: 180},
    {key: 'year', label: 'За год', days: 365},
];

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

function buildPresetRange(days) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    return {
        dateFrom: toDateInputValue(start),
        dateTo: toDateInputValue(end),
    };
}

function getPresetByRange(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) return null;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    const diffDays = Math.round((to - from) / 86400000) + 1;
    return PERIOD_PRESETS.find((preset) => preset.days === diffDays) || null;
}

function formatPeriodButtonLabel(dateFrom, dateTo) {
    const preset = getPresetByRange(dateFrom, dateTo);
    if (preset) return preset.label;
    return 'Свой период';
}

function formatShortDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
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

    const defaultRange = useMemo(() => buildPresetRange(30), []);
    const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
    const [dateTo, setDateTo] = useState(defaultRange.dateTo);
    const [draftDateFrom, setDraftDateFrom] = useState(defaultRange.dateFrom);
    const [draftDateTo, setDraftDateTo] = useState(defaultRange.dateTo);
    const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);

    // Сортировка по дате
    const [dateSort, setDateSort] = useState('desc'); // desc = новые сверху, asc = старые сверху

    // кэш картинок по product_id (строка → url)
    const [productImageMap, setProductImageMap] = useState(() => new Map());
    const inFlightRef = useRef(new Set()); // чтобы не дёргать один и тот же product_id параллельно
    const periodMenuRef = useRef(null);

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

    useEffect(() => {
        if (!isPeriodMenuOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!periodMenuRef.current?.contains(event.target)) {
                setIsPeriodMenuOpen(false);
                setDraftDateFrom(dateFrom);
                setDraftDateTo(dateTo);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isPeriodMenuOpen, dateFrom, dateTo]);

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
    const totalOrders = filteredSortedOrders.length;

    const summary = useMemo(() => {
        const sum = filteredSortedOrders.reduce((acc, order) => acc + Number(order?.total_amount || 0), 0);
        const units = filteredSortedOrders.reduce((acc, order) => acc + itemsCount(order), 0);
        return {sum, units};
    }, [filteredSortedOrders]);

    const skeletonCards = useMemo(
        () => Array.from({length: ORDER_SKELETON_COUNT}, (_, index) => `order-skeleton-${index}`),
        []
    );

    const applyPeriod = (nextFrom, nextTo) => {
        setDateFrom(nextFrom);
        setDateTo(nextTo);
        setDraftDateFrom(nextFrom);
        setDraftDateTo(nextTo);
        setIsPeriodMenuOpen(false);
    };

    const handlePresetSelect = (days) => {
        const range = buildPresetRange(days);
        applyPeriod(range.dateFrom, range.dateTo);
    };

    const handleApplyCustomPeriod = () => {
        if (!draftDateFrom || !draftDateTo) return;
        applyPeriod(draftDateFrom, draftDateTo);
    };

    const handleTogglePeriodMenu = () => {
        const nextOpen = !isPeriodMenuOpen;
        setIsPeriodMenuOpen(nextOpen);
        if (nextOpen) {
            setDraftDateFrom(dateFrom);
            setDraftDateTo(dateTo);
        }
    };

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
                        <div className={styles.headStats}>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{totalOrders}</span>
                                <span className={styles.heroStatLabel}>заказов</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{summary.units}</span>
                                <span className={styles.heroStatLabel}>товаров</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatValue}>{money(summary.sum)} ₽</span>
                                <span className={styles.heroStatLabel}>на сумму</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.headRight}>
                        <div className={styles.filters}>
                            <div className={styles.periodMenuWrap} ref={periodMenuRef}>
                                <span className={styles.filterLabel}>Период</span>
                                <button
                                    type="button"
                                    className={styles.periodButton}
                                    onClick={handleTogglePeriodMenu}
                                    aria-expanded={isPeriodMenuOpen}
                                >
                                    <span>{formatPeriodButtonLabel(dateFrom, dateTo)}</span>
                                    <span className={styles.periodButtonMeta}>
                                        {formatShortDate(dateFrom)} - {formatShortDate(dateTo)}
                                    </span>
                                </button>

                                {isPeriodMenuOpen ? (
                                    <div className={styles.periodPopover}>
                                        <div className={styles.periodPopoverTitle}>Быстрый выбор</div>
                                        <div className={styles.periodPresetGrid}>
                                            {PERIOD_PRESETS.map((preset) => (
                                                <button
                                                    key={preset.key}
                                                    type="button"
                                                    className={`${styles.periodPreset} ${getPresetByRange(dateFrom, dateTo)?.key === preset.key ? styles.periodPresetActive : ''}`}
                                                    onClick={() => handlePresetSelect(preset.days)}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className={styles.periodDivider}/>

                                        <div className={styles.periodPopoverTitle}>Свой период</div>
                                        <div className={styles.periodDateGrid}>
                                            <input
                                                className={styles.dateInput}
                                                type="date"
                                                value={draftDateFrom}
                                                onChange={(e) => setDraftDateFrom(e.target.value)}
                                            />
                                            <input
                                                className={styles.dateInput}
                                                type="date"
                                                value={draftDateTo}
                                                onChange={(e) => setDraftDateTo(e.target.value)}
                                            />
                                        </div>

                                        <div className={styles.periodActions}>
                                            <button
                                                type="button"
                                                className={styles.btnGhost}
                                                onClick={() => {
                                                    setDraftDateFrom(dateFrom);
                                                    setDraftDateTo(dateTo);
                                                    setIsPeriodMenuOpen(false);
                                                }}
                                            >
                                                Отмена
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.btnLight}
                                                onClick={handleApplyCustomPeriod}
                                                disabled={!draftDateFrom || !draftDateTo}
                                            >
                                                Применить
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
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
                    {loading ? (
                        <div className={styles.ordersGrid}>
                            {skeletonCards.map(card => (
                                <div key={card} className={styles.orderSkeleton} aria-hidden="true">
                                    <div className={styles.orderSkeletonTop}/>
                                    <div className={styles.orderSkeletonMeta}/>
                                    <div className={styles.orderSkeletonMetaShort}/>
                                    <div className={styles.orderSkeletonItems}>
                                        <div className={styles.orderSkeletonItem}/>
                                        <div className={styles.orderSkeletonItem}/>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredSortedOrders.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>Заказов нет</div>
                            <div className={styles.emptyTitle}>Ничего не найдено по текущим фильтрам</div>
                            <div className={styles.emptyText}>Измени статус или период, чтобы показать подходящие заказы.</div>
                        </div>
                    ) : (
                        <div className={styles.ordersGrid}>
                            {filteredSortedOrders.map(o => {
                                const items = Array.isArray(o?.items) ? o.items : [];
                                const previewItems = items.slice(0, 3);
                                const restItemsCount = Math.max(items.length - previewItems.length, 0);

                                return (
                                    <div
                                        key={o.id}
                                        className={styles.orderCard}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => openOrder(o.id)}
                                        onKeyDown={(e) => onRowKeyDown(e, o.id)}
                                        title="Открыть заказ"
                                    >
                                        <div className={styles.orderCardHead}>
                                            <div className={styles.orderLead}>
                                                <div className={styles.orderIdRow}>
                                                    <span className={styles.orderId}>Заказ #{o.id}</span>
                                                    <span className={`${styles.badge} ${styles[`badge_${o.status}`] || ''}`}>
                                                        {statusLabel(o.status)}
                                                    </span>
                                                </div>
                                                <div className={styles.orderMetaRow}>
                                                    <span className={styles.metaChip}>{formatDateTime(o.created_at)}</span>
                                                    <span className={styles.metaChip}>{deliveryLabel(o.delivery_type)}</span>
                                                    <span className={styles.metaChip}>{itemsCount(o)} шт.</span>
                                                </div>
                                            </div>

                                            <div className={styles.orderTotalBlock}>
                                                <span className={styles.orderTotal}>{money(o.total_amount)} ₽</span>
                                                <span className={styles.orderTotalSub}>{o.delivery_service || 'Без уточнения службы'}</span>
                                            </div>
                                        </div>

                                        <div className={styles.orderBody}>
                                            <div className={styles.orderSection}>
                                                <div className={styles.sectionLabel}>Состав</div>
                                                <div className={styles.itemsStack}>
                                                    {previewItems.length === 0 ? (
                                                        <div className={styles.itemsEmpty}>Позиции не добавлены</div>
                                                    ) : (
                                                        previewItems.map((it, idx) => {
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
                                                                        <span className={styles.itemMeta}>Количество: {qty}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}

                                                    {restItemsCount > 0 && (
                                                        <div className={styles.moreItems}>
                                                            Еще {restItemsCount} поз.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.orderAside}>
                                                <div className={styles.orderInfoCard}>
                                                    <div className={styles.sectionLabel}>Доставка</div>
                                                    <div className={styles.deliveryType}>{deliveryLabel(o.delivery_type)}</div>
                                                    <div className={styles.deliveryMeta}>{o.delivery_service || 'Служба не указана'}</div>
                                                </div>

                                                <div className={styles.orderInfoCard}>
                                                    <div className={styles.sectionLabel}>Итоги</div>
                                                    <div className={styles.infoValue}>{itemsCount(o)} товара</div>
                                                    <div className={styles.infoSub}>Открыть карточку заказа</div>
                                                </div>
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
