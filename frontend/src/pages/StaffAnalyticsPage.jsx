import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from 'recharts';
import styles from '../styles/StaffAnalyticsPage.module.css';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';

const STATUS_LABELS = {
    new: 'Новые',
    paid: 'Оплачены',
    shipped: 'Отгружены',
    completed: 'Доставлены',
    canceled: 'Отменены',
};

const STATUS_LABELS_SINGLE = {
    new: 'Ожидает оплаты',
    paid: 'Оплачен',
    shipped: 'Отгружен',
    completed: 'Доставлен',
    canceled: 'Отменен',
};

const DELIVERY_LABELS = {
    store_pickup: 'Самовывоз',
    courier: 'Курьер',
    pvz: 'ПВЗ',
};

const STATUS_COLORS = {
    new: '#d89a45',
    paid: '#5a89c7',
    shipped: '#43a489',
    completed: '#5fa56d',
    canceled: '#cf737d',
};

const STATUS_BAR_COLORS = {
    new: '#d89a45',
    paid: '#5a89c7',
    shipped: '#43a489',
    completed: '#5fa56d',
    canceled: '#cf737d',
};

const DELIVERY_COLORS = ['#111827', '#475569', '#94a3b8'];
const PAYMENT_COLORS = ['#9ca3af', '#475569', '#16a34a', '#dc2626', '#f59e0b'];
const PERIOD_PRESETS = [
    {key: 'week', label: 'За неделю', days: 7},
    {key: 'month', label: 'За месяц', days: 30},
    {key: 'quarter', label: 'За 3 месяца', days: 90},
    {key: 'half_year', label: 'За 6 месяцев', days: 180},
    {key: 'year', label: 'За год', days: 365},
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toDateInputValue(d) {
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(value) {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
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
    const from = parseLocalDate(dateFrom);
    const to = parseLocalDate(dateTo);
    if (!from || !to) return null;
    const diffDays = Math.round((to - from) / 86400000) + 1;
    return PERIOD_PRESETS.find((preset) => preset.days === diffDays) || null;
}

function formatPeriodButtonLabel(dateFrom, dateTo) {
    const preset = getPresetByRange(dateFrom, dateTo);
    if (preset) return preset.label;
    return 'Свой период';
}

function pluralize(value, one, few, many) {
    const abs = Math.abs(Number(value || 0));
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function formatNumber(v, digits = 0) {
    return Number(v || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatMoney(v) {
    return formatNumber(v, 0);
}

function formatCompactMoney(v) {
    const value = Number(v || 0);
    if (Math.abs(value) >= 1000000) {
        return `${Number(value / 1000000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} млн`;
    }
    if (Math.abs(value) >= 1000) {
        return `${Number(value / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} тыс`;
    }
    return formatNumber(value, 0);
}

function formatPercent(v) {
    return `${Number(v || 0).toLocaleString('ru-RU', {maximumFractionDigits: 1})}%`;
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatShortDate(value) {
    if (!value) return '';
    const date = parseLocalDate(value);
    if (!date) return value;
    return date.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}

function formatBucketLabel(row, granularity) {
    if (!row?.bucket_start) return row?.label || '';
    if (granularity === 'month') {
        return parseLocalDate(row.bucket_start)?.toLocaleDateString('ru-RU', {month: 'short', year: '2-digit'}) || row?.label || '';
    }
    if (granularity === 'week') {
        return `${formatShortDate(row.bucket_start)} - ${formatShortDate(row.bucket_end)}`;
    }
    return parseLocalDate(row.bucket_start)?.toLocaleDateString('ru-RU', {day: 'numeric'}) || row?.label || '';
}

function formatBucketRange(row, granularity) {
    if (!row?.bucket_start) return row?.label || '';
    if (granularity === 'month') {
        return parseLocalDate(row.bucket_start)?.toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'}) || row?.label || '';
    }
    if (granularity === 'week') {
        return `${formatShortDate(row.bucket_start)} - ${formatShortDate(row.bucket_end)}`;
    }
    return formatShortDate(row.bucket_start);
}

function formatAxisKey(value, granularity) {
    if (!value) return '';
    const [bucketStart, bucketEnd] = String(value).split('|');
    return formatBucketLabel({bucket_start: bucketStart, bucket_end: bucketEnd}, granularity);
}

function toneClass(tone, stylesMap) {
    if (tone === 'danger') return stylesMap.toneDanger;
    if (tone === 'warning') return stylesMap.toneWarning;
    if (tone === 'info') return stylesMap.toneInfo;
    return stylesMap.toneNeutral;
}

function operationCardClass(key, stylesMap) {
    if (key === 'new') return stylesMap.operationNew;
    if (key === 'ready') return stylesMap.operationPaid;
    if (key === 'shipped') return stylesMap.operationShipped;
    if (key === 'completed') return stylesMap.operationCompleted;
    return '';
}

function formatMetricValue(value, kind) {
    if (kind === 'money') return `${formatMoney(value)} ₽`;
    if (kind === 'percent') return formatPercent(value);
    return formatNumber(value, 0);
}

function roundedTopRectPath(x, y, width, height, radius) {
    if (width <= 0 || height <= 0) return '';
    const r = Math.min(radius, width / 2, height / 2);
    return [
        `M ${x} ${y + height}`,
        `L ${x} ${y + r}`,
        `Q ${x} ${y} ${x + r} ${y}`,
        `L ${x + width - r} ${y}`,
        `Q ${x + width} ${y} ${x + width} ${y + r}`,
        `L ${x + width} ${y + height}`,
        'Z',
    ].join(' ');
}

function DeliveryFlowBarShape(props) {
    const {x, y, width, height, payload} = props;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

    const totalRate = Number(payload?.delivery_flow_rate || 0);
    const deliveredRate = Number(payload?.completion_rate || 0);
    const innerInset = 0;
    const innerWidth = width;
    const deliveredHeight = totalRate > 0
        ? Math.max(0, Math.min(height, (height * deliveredRate) / totalRate))
        : 0;
    const innerX = x + innerInset;
    const innerY = y + (height - deliveredHeight);

    return (
        <g>
            <path d={roundedTopRectPath(x, y, width, height, 8)} fill="#cbd5e1"/>
            {deliveredHeight > 0 ? (
                <path d={roundedTopRectPath(innerX, innerY, innerWidth, deliveredHeight, 8)} fill="#16a34a"/>
            ) : null}
        </g>
    );
}

function CustomTooltip({active, payload, label}) {
    if (!active || !payload?.length) return null;

    const tooltipTitle = payload[0]?.payload?.tooltipLabel || label;
    const rowPayload = payload[0]?.payload || {};
    const isDeliveryFlowTooltip = payload.some((entry) => entry?.dataKey === 'delivery_flow_rate');
    const tooltipRows = isDeliveryFlowTooltip
        ? [
            {key: 'delivery_flow_rate', name: 'Еще в пути и доставлено', color: '#cbd5e1', value: rowPayload.delivery_flow_rate},
            {key: 'completion_rate', name: 'Доставлено', color: '#16a34a', value: rowPayload.completion_rate},
        ]
        : payload.map((entry) => ({
            key: `${entry.dataKey}-${entry.name}`,
            name: entry.name,
            color: entry.color,
            value: entry.value,
            dataKey: entry.dataKey,
        }));

    return (
        <div className={styles.chartTooltip}>
            <div className={styles.chartTooltipTitle}>{tooltipTitle}</div>
            <div className={styles.chartTooltipList}>
                {tooltipRows.map((entry) => (
                    <div key={entry.key} className={styles.chartTooltipRow}>
                        <span className={styles.chartTooltipName}>
                            <span className={styles.chartTooltipDot} style={{background: entry.color}}/>
                            {entry.name}
                        </span>
                        <strong>
                            {String(entry.dataKey || entry.key).includes('rate')
                                ? formatPercent(entry.value)
                                : String(entry.dataKey || entry.key).includes('revenue')
                                    ? `${formatMoney(entry.value)} ₽`
                                    : formatNumber(entry.value, 0)}
                        </strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EmptyPanel({text}) {
    return <div className={styles.emptyState}>{text}</div>;
}

export default function StaffAnalyticsPage() {
    const {authFetch} = useAuth();
    const notify = useNotify();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState('');
    const [error, setError] = useState('');
    const [analytics, setAnalytics] = useState(null);

    const defaultRange = useMemo(() => buildPresetRange(30), []);
    const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
    const [dateTo, setDateTo] = useState(defaultRange.dateTo);
    const [draftDateFrom, setDraftDateFrom] = useState(defaultRange.dateFrom);
    const [draftDateTo, setDraftDateTo] = useState(defaultRange.dateTo);
    const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const periodMenuRef = useRef(null);
    const exportMenuRef = useRef(null);

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const qs = new URLSearchParams({
                date_from: dateFrom,
                date_to: dateTo,
            });
            const res = await authFetch(`/api/staff/analytics/?${qs.toString()}`, {method: 'GET'});

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось загрузить аналитику');
            }

            setAnalytics(data);
            return true;
        } catch (e) {
            setAnalytics(null);
            setError(e?.message || 'Ошибка');
            return false;
        } finally {
            setLoading(false);
        }
    }, [authFetch, dateFrom, dateTo]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

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

    useEffect(() => {
        if (!isExportMenuOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!exportMenuRef.current?.contains(event.target)) {
                setIsExportMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isExportMenuOpen]);

    const period = analytics?.period || {};
    const overview = analytics?.overview || {};
    const attention = analytics?.attention || [];
    const timeline = useMemo(() => (Array.isArray(analytics?.timeline) ? analytics.timeline : []), [analytics?.timeline]);
    const statusBreakdown = analytics?.status_breakdown || [];
    const deliveryBreakdown = analytics?.delivery_breakdown || [];
    const paymentBreakdown = analytics?.payment_breakdown || [];
    const topProducts = analytics?.top_products || [];
    const recentOrders = analytics?.recent_orders || [];
    const funnel = useMemo(() => (Array.isArray(analytics?.funnel) ? analytics.funnel : []), [analytics?.funnel]);
    const weekdayBreakdown = analytics?.weekday_breakdown || [];
    const cityBreakdown = analytics?.city_breakdown || [];

    const timelineDisplay = useMemo(() => {
        return timeline.map((row) => ({
            ...row,
            axisKey: `${row.bucket_start || ''}|${row.bucket_end || ''}`,
            axisLabel: formatBucketLabel(row, period.granularity),
            tooltipLabel: formatBucketRange(row, period.granularity),
        }));
    }, [timeline, period.granularity]);

    const funnelDisplay = useMemo(() => {
        const total = Math.max(Number(overview.orders_total || 0), 1);
        return (Array.isArray(funnel) ? funnel : []).map((item, index, arr) => {
            const current = Number(item?.value || 0);
            const prev = index === 0 ? total : Math.max(Number(arr[index - 1]?.value || 0), 1);
            return {
                ...item,
                current,
                share_total: total ? (current / total) * 100 : 0,
                share_prev: prev ? (current / prev) * 100 : 0,
                drop_off: index === 0 ? 0 : Math.max(0, 100 - ((current / prev) * 100)),
            };
        });
    }, [funnel, overview.orders_total]);

    const summaryCards = [
        {
            label: 'Создано заказов',
            value: formatNumber(overview.orders_total),
            note: `${formatNumber(period.days)} ${pluralize(period.days, 'день', 'дня', 'дней')} по дате создания`,
        },
        {
            label: 'Заказано на сумму',
            value: `${formatMoney(overview.gross_revenue)} ₽`,
            note: 'Сумма всех заказов, созданных в периоде',
        },
        {
            label: 'Оплачено на сумму',
            value: `${formatMoney(overview.paid_revenue)} ₽`,
            note: 'Успешные платежи по дате оплаты',
        },
        {
            label: 'Средний чек',
            value: `${formatMoney(overview.average_order)} ₽`,
            note: 'Средняя сумма одного заказа',
        },
        {
            label: 'Товаров в заказе',
            value: formatNumber(overview.avg_items_per_order, 1),
            note: 'Среднее число позиций',
        },
        {
            label: 'Успешные оплаты',
            value: formatPercent(overview.payment_success_rate),
            note: `${formatNumber(overview.payments_total)} ${pluralize(overview.payments_total, 'платеж', 'платежа', 'платежей')}`,
        },
    ];

    const operationCards = [
        {key: 'new', label: 'Ожидают оплаты', value: formatNumber(overview.pending_payment), note: 'Таймер оплаты еще не истек'},
        {key: 'paid', label: 'К сборке', value: formatNumber(overview.pending_assembly), note: 'Оплачены и доступны сборщику'},
        {key: 'shipped', label: 'В пути', value: formatNumber(overview.shipped_total), note: 'Переданы в доставку'},
        {key: 'completed', label: 'Доставлены', value: formatNumber(overview.completed_total), note: formatPercent(overview.completion_rate)},
    ];

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
        const preset = PERIOD_PRESETS.find((item) => item.days === days);
        if (preset) {
            notify.info(`Применен период: ${preset.label}`);
        }
    };

    const handleApplyCustomPeriod = () => {
        if (!draftDateFrom || !draftDateTo) {
            notify.warning('Укажи обе даты периода');
            return;
        }
        if (draftDateFrom > draftDateTo) {
            notify.warning('Дата начала не может быть позже даты окончания');
            return;
        }
        applyPeriod(draftDateFrom, draftDateTo);
        notify.info('Период обновлен');
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

    const handleExport = async (format) => {
        setError('');
        setExporting(format);
        setIsExportMenuOpen(false);
        try {
            const qs = new URLSearchParams({
                date_from: dateFrom,
                date_to: dateTo,
                export_format: format,
            });
            const res = await authFetch(`/api/staff/analytics/export/?${qs.toString()}`, {method: 'GET'});
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.detail || 'Не удалось выгрузить данные');
            }

            const blob = await res.blob();
            const header = res.headers.get('content-disposition') || '';
            const matchedName = header.match(/filename="([^"]+)"/i);
            const fileName = matchedName?.[1] || `analytics.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
            notify.success(`Отчет ${format === 'xlsx' ? 'Excel' : 'CSV'} скачан`);
        } catch (e) {
            setError(e?.message || 'Ошибка выгрузки');
        } finally {
            setExporting('');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.head}>
                    <div className={styles.headLeft}>
                        <h1 className={styles.title}>Аналитика</h1>
                        <div className={styles.sub}>Сводка по заказам, выручке, логистике и работе склада</div>
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

                            <button
                                type="button"
                                className={styles.btnLight}
                                onClick={async () => {
                                    const ok = await loadAnalytics();
                                    if (ok) notify.info('Аналитика обновлена');
                                }}
                                disabled={loading}
                            >
                                Обновить
                            </button>

                            <div className={styles.periodMenuWrap} ref={exportMenuRef}>
                                <button
                                    type="button"
                                    className={styles.btnLight}
                                    onClick={() => setIsExportMenuOpen((open) => !open)}
                                    disabled={!!exporting}
                                    aria-expanded={isExportMenuOpen}
                                >
                                    {exporting ? 'Готовлю отчет…' : 'Отчет за период'}
                                </button>

                                {isExportMenuOpen ? (
                                    <div className={styles.periodPopover}>
                                        <div className={styles.periodPopoverTitle}>Выгрузка отчета</div>
                                        <div className={styles.periodHint}>
                                            Период: {formatShortDate(dateFrom)} - {formatShortDate(dateTo)}
                                        </div>
                                        <div className={styles.periodActions}>
                                            <button
                                                type="button"
                                                className={styles.btnLight}
                                                onClick={() => handleExport('csv')}
                                            >
                                                Скачать CSV
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.btnLight}
                                                onClick={() => handleExport('xlsx')}
                                            >
                                                Скачать Excel
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className={`${styles.notice} ${styles.noticeErr}`}>
                        <span>{error}</span>
                    </div>
                ) : null}

                <section className={styles.dashboardZone}>
                    <div className={styles.dashboardMain}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Заказано и оплачено</div>
                                    <div className={styles.panelHint}>Темная линия показывает сумму заказов по дате создания, синяя — сумму успешных оплат по дате оплаты</div>
                                </div>
                                <div className={styles.inlineLegend}>
                                    <span className={styles.inlineLegendItem}>
                                        <span className={styles.inlineLegendDot} style={{background: '#111827'}}/>
                                        Заказано на сумму
                                    </span>
                                    <span className={styles.inlineLegendItem}>
                                        <span className={styles.inlineLegendDot} style={{background: '#3b82f6'}}/>
                                        Оплаченная выручка
                                    </span>
                                </div>
                            </div>

                            {loading ? (
                                <div className={styles.chartSkeleton}/>
                            ) : timelineDisplay.length ? (
                                <div className={styles.chartSurface}>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <ComposedChart data={timelineDisplay} margin={{top: 8, right: 12, left: 8, bottom: 4}}>
                                            <defs>
                                                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#111827" stopOpacity="0.16"/>
                                                    <stop offset="100%" stopColor="#111827" stopOpacity="0.02"/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke="#d6e0ee" strokeDasharray="3 8" vertical={false}/>
                                            <XAxis
                                                dataKey="axisKey"
                                                tickFormatter={(value) => formatAxisKey(value, period.granularity)}
                                                tickLine={false}
                                                axisLine={false}
                                                minTickGap={18}
                                                dy={8}
                                            />
                                            <YAxis tickLine={false} axisLine={false} tickFormatter={formatCompactMoney} width={72}/>
                                            <Tooltip content={<CustomTooltip/>}/>
                                            <Area
                                                type="monotone"
                                                dataKey="revenue"
                                                name="Оборот"
                                                fill="url(#revenueFill)"
                                                stroke="#111827"
                                                strokeWidth={2.5}
                                                isAnimationActive={false}
                                                dot={false}
                                                activeDot={{r: 5, strokeWidth: 2, fill: '#fff', stroke: '#111827'}}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="paid_revenue"
                                                name="Оплаченная выручка"
                                                stroke="#3b82f6"
                                                strokeWidth={2.5}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                isAnimationActive={false}
                                                dot={false}
                                                activeDot={{r: 5, strokeWidth: 2, fill: '#fff', stroke: '#3b82f6'}}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <EmptyPanel text="За выбранный период пока нет данных"/>
                            )}
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Доставка по статусу</div>
                                    <div className={styles.panelHint}>Серый сегмент показывает заказы в пути, зеленый — уже доставленные. Новые и неоплаченные заказы сюда не попадают.</div>
                                </div>
                                <div className={styles.inlineLegend}>
                                    <span className={styles.inlineLegendItem}>
                                        <span className={styles.inlineLegendDot} style={{background: '#cbd5e1'}}/>
                                        Еще в пути
                                    </span>
                                    <span className={styles.inlineLegendItem}>
                                        <span className={styles.inlineLegendDot} style={{background: '#16a34a'}}/>
                                        Доставлено
                                    </span>
                                </div>
                            </div>

                            {loading ? (
                                <div className={styles.chartSkeleton}/>
                            ) : timelineDisplay.length ? (
                                <div className={styles.chartSurface}>
                                    <ResponsiveContainer width="100%" height={208}>
                                        <ComposedChart data={timelineDisplay} margin={{top: 8, right: 12, left: 8, bottom: 4}} barGap="-100%" barCategoryGap="34%">
                                            <CartesianGrid stroke="#d6e0ee" strokeDasharray="3 8" vertical={false}/>
                                            <XAxis
                                                dataKey="axisKey"
                                                tickFormatter={(value) => formatAxisKey(value, period.granularity)}
                                                tickLine={false}
                                                axisLine={false}
                                                minTickGap={18}
                                                dy={8}
                                            />
                                            <YAxis domain={[0, 100]} tickFormatter={formatPercent} tickLine={false} axisLine={false} width={56}/>
                                            <Tooltip content={<CustomTooltip/>}/>
                                            <Bar
                                                dataKey="delivery_flow_rate"
                                                name="Поток доставки"
                                                shape={<DeliveryFlowBarShape/>}
                                                barSize={18}
                                                isAnimationActive={false}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <EmptyPanel text="За выбранный период пока нет данных"/>
                            )}
                        </section>

                        <div className={styles.operationDock}>
                            {operationCards.map((card) => (
                                <div
                                    className={`${styles.operationMiniCard} ${operationCardClass(card.key, styles)}`}
                                    key={card.key}
                                >
                                    <div className={styles.operationMiniLabel}>{card.label}</div>
                                    <div className={styles.operationMiniValue}>{card.value}</div>
                                    <div className={styles.operationMiniNote}>{card.note}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className={styles.dashboardSide}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Ключевые сигналы</div>
                                    <div className={styles.panelHint}>Показатели, за которыми стоит следить в первую очередь</div>
                                </div>
                            </div>
                            <div className={styles.attentionStack}>
                                {attention.map((item) => (
                                    <div key={item.key} className={`${styles.attentionCard} ${toneClass(item.tone, styles)}`}>
                                        <div className={styles.attentionLabel}>{item.label}</div>
                                        <div className={styles.attentionValue}>{formatMetricValue(item.value, item.format)}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Состояние заказов</div>
                                    <div className={styles.panelHint}>Это текущий срез по статусам, а не количество созданных заказов за период</div>
                                </div>
                            </div>

                            {loading ? (
                                <div className={styles.chartSkeletonSmall}/>
                            ) : statusBreakdown.length ? (
                                <ResponsiveContainer width="100%" height={224}>
                                    <BarChart data={statusBreakdown} layout="vertical" margin={{top: 8, right: 8, left: 8, bottom: 8}}>
                                        <CartesianGrid stroke="#eceff4" horizontal={false}/>
                                        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false}/>
                                        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={108}/>
                                        <Tooltip content={<CustomTooltip/>}/>
                                        <Bar dataKey="count" name="Заказы" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                                            {statusBreakdown.map((row) => (
                                                <Cell key={row.key} fill={STATUS_BAR_COLORS[row.key] || '#e8ebf0'} stroke={STATUS_COLORS[row.key] || '#111827'} strokeWidth={1}/>
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyPanel text="Нет заказов для разбивки по статусам"/>
                            )}
                        </section>
                    </aside>
                </section>

                <div className={styles.summaryGrid}>
                    {summaryCards.map((card) => (
                        <div className={styles.overviewCard} key={card.label}>
                            <div className={styles.overviewLabel}>{card.label}</div>
                            <div className={styles.overviewValue}>{card.value}</div>
                            <div className={styles.overviewNote}>{card.note}</div>
                        </div>
                    ))}
                </div>

                <section className={styles.contentColumns}>
                    <div className={styles.contentColumnMain}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Топ товаров</div>
                                    <div className={styles.panelHint}>Лидеры по количеству продаж и выручке</div>
                                </div>
                            </div>

                            <div className={styles.productsList}>
                                {(loading ? Array.from({length: 5}, (_, i) => ({name: `product-${i}`})) : topProducts).map((product, index) => (
                                    <div className={styles.productRow} key={product.product_id || product.name || index}>
                                        {loading ? (
                                            <div className={styles.rowSkeleton}/>
                                        ) : (
                                            <>
                                                <div className={styles.productRank}>{index + 1}</div>
                                                <div className={styles.productMeta}>
                                                    <div className={styles.productName}>{product.name}</div>
                                                    <div className={styles.productSub}>
                                                        {formatNumber(product.orders_count)} {pluralize(product.orders_count, 'заказ', 'заказа', 'заказов')}
                                                    </div>
                                                </div>
                                                <div className={styles.productStats}>
                                                    <div>{formatNumber(product.units)} шт.</div>
                                                    <strong>{formatMoney(product.revenue)} ₽</strong>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Доставка и оплаты</div>
                                    <div className={styles.panelHint}>Какие способы доставки и статусы оплат преобладают</div>
                                </div>
                            </div>
                            <div className={styles.doubleColumnCompact}>
                                <div>
                                    <div className={styles.subSectionTitle}>Доставка</div>
                                    <div className={styles.miniList}>
                                        {deliveryBreakdown.map((item, index) => (
                                            <div className={styles.miniRow} key={item.key}>
                                                <span className={styles.miniLabel}>
                                                    <span className={styles.legendDot} style={{background: DELIVERY_COLORS[index % DELIVERY_COLORS.length]}}/>
                                                    {item.label}
                                                </span>
                                                <strong>{formatNumber(item.count)} · {formatPercent(item.share)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className={styles.subSectionTitle}>Платежи</div>
                                    <div className={styles.miniList}>
                                        {paymentBreakdown.map((item, index) => (
                                            <div className={styles.miniRow} key={item.key}>
                                                <span className={styles.miniLabel}>
                                                    <span className={styles.legendDot} style={{background: PAYMENT_COLORS[index % PAYMENT_COLORS.length]}}/>
                                                    {item.label}
                                                </span>
                                                <strong>{formatNumber(item.count)} · {formatPercent(item.share)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Города</div>
                                    <div className={styles.panelHint}>Откуда приходит больше заказов и выручки</div>
                                </div>
                            </div>
                            <div className={styles.cityList}>
                                {loading ? (
                                    Array.from({length: 4}, (_, index) => <div key={index} className={styles.rowSkeleton}/>)
                                ) : cityBreakdown.length ? (
                                    cityBreakdown.map((item) => (
                                        <div className={styles.cityRow} key={item.city}>
                                            <div>
                                                <div className={styles.cityName}>{item.city}</div>
                                                <div className={styles.citySub}>
                                                    {formatNumber(item.orders)} {pluralize(item.orders, 'заказ', 'заказа', 'заказов')}
                                                </div>
                                            </div>
                                            <div className={styles.cityRevenue}>{formatMoney(item.revenue)} ₽</div>
                                        </div>
                                    ))
                                ) : (
                                    <EmptyPanel text="Нет данных по городам"/>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className={styles.contentColumnSide}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>Воронка прохождения заказов</div>
                                    <div className={styles.panelHint}>Накопительная воронка по заказам, созданным за период: сколько из них дошло до оплаты, отгрузки и доставки</div>
                                </div>
                            </div>
                            <div className={styles.funnelList}>
                                {(loading ? Array.from({length: 5}, (_, index) => ({key: index})) : funnelDisplay).map((item, index) => (
                                    <div className={styles.funnelStep} key={item.key}>
                                        {loading ? (
                                            <div className={styles.rowSkeleton}/>
                                        ) : (
                                            <>
                                                <div className={styles.funnelStepHead}>
                                                    <div>
                                                        <div className={styles.funnelStepIndex}>Этап {index + 1}</div>
                                                        <div className={styles.funnelStepTitle}>{item.label}</div>
                                                    </div>
                                                    <div className={styles.funnelStepValue}>{formatNumber(item.current)}</div>
                                                </div>
                                                <div className={styles.funnelTrack}>
                                                    <div
                                                        className={styles.funnelFill}
                                                        style={{width: `${Math.max(8, item.share_total)}%`}}
                                                    />
                                                </div>
                                                <div className={styles.funnelMetaRow}>
                                                    {index === 0 ? (
                                                        <>
                                                            <span>База расчета воронки</span>
                                                            <span>Все созданные за период, включая {formatNumber(overview.canceled_total)} {pluralize(overview.canceled_total, 'отмененный заказ', 'отмененных заказа', 'отмененных заказов')}</span>
                                                        </>
                                                    ) : index === 1 ? (
                                                        <>
                                                            <span>Конверсия в оплату: {formatPercent(item.share_total)}</span>
                                                            <span>Не дошло до оплаты: {formatPercent(item.drop_off)}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>{formatPercent(item.share_total)} от всех созданных заказов</span>
                                                            <span>{formatPercent(item.share_prev)} дошло от предыдущего этапа</span>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <div className={styles.panelTitle}>По дням недели</div>
                                    <div className={styles.panelHint}>В какие дни поток заказов выше обычного</div>
                                </div>
                            </div>

                            {loading ? (
                                <div className={styles.chartSkeletonSmall}/>
                            ) : weekdayBreakdown.length ? (
                                <ResponsiveContainer width="100%" height={196}>
                                    <BarChart data={weekdayBreakdown} margin={{top: 8, right: 8, left: -12, bottom: 8}}>
                                        <CartesianGrid stroke="#eceff4" vertical={false}/>
                                        <XAxis dataKey="label" tickLine={false} axisLine={false}/>
                                        <YAxis hide width={0}/>
                                        <Tooltip content={<CustomTooltip/>}/>
                                        <Bar dataKey="count" name="Заказы" fill="#111827" radius={[8, 8, 0, 0]} isAnimationActive={false}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyPanel text="Нет данных по дням недели"/>
                            )}
                        </section>
                    </div>
                </section>

                <section className={styles.recentSection}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <div className={styles.panelTitle}>Недавняя активность</div>
                                <div className={styles.panelHint}>Быстрый переход в карточку заказа</div>
                            </div>
                        </div>

                        <div className={styles.recentList}>
                            {(loading ? Array.from({length: 6}, (_, i) => ({id: `recent-${i}`})) : recentOrders).map((order, index) => (
                                <div
                                    key={order.id || index}
                                    className={styles.recentRow}
                                    role={loading ? undefined : 'button'}
                                    tabIndex={loading ? undefined : 0}
                                    onClick={loading ? undefined : () => openOrder(order.id)}
                                    onKeyDown={loading ? undefined : (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openOrder(order.id);
                                        }
                                    }}
                                >
                                    {loading ? (
                                        <div className={styles.rowSkeleton}/>
                                    ) : (
                                        <>
                                            <div className={styles.recentMain}>
                                                <div className={styles.recentId}>Заказ #{order.id}</div>
                                                <div className={styles.recentMeta}>
                                                    {order.customer_name} · {formatDateTime(order.created_at)}
                                                </div>
                                            </div>
                                            <div className={styles.recentSide}>
                                                <div className={styles.recentTotal}>{formatMoney(order.total_amount)} ₽</div>
                                                <div className={styles.recentMeta}>
                                                    {formatNumber(order.items_count)} {pluralize(order.items_count, 'товар', 'товара', 'товаров')} · {DELIVERY_LABELS[order.delivery_type] || order.delivery_type}
                                                </div>
                                            </div>
                                            <div className={styles.recentStatusBadge} style={{background: STATUS_COLORS[order.status] || '#111827'}}>
                                                {STATUS_LABELS_SINGLE[order.status] || order.status}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </section>
            </div>
        </div>
    );
}
