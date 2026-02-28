import {useEffect, useState} from 'react';
import styles from '../styles/ProfilePage.module.css';
import {useAuth} from '../store/authContext';

function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
}

function statusLabel(status) {
    if (!status) return '';
    const map = {
        new: 'Ожидает сборки',
        paid: 'Оплачен',
        shipped: 'Отправлен',
        completed: 'Выполнен',
        canceled: 'Отменён',
        processing: 'В обработке',
    };
    return map[status] || status;
}

function deliveryLabel(deliveryType) {
    const map = {
        store_pickup: 'Самовывоз',
        courier: 'Курьер',
        pvz: 'ПВЗ',
    };
    return map[deliveryType] || deliveryType || '—';
}

function isBlank(v) {
    return !String(v || '').trim();
}

export default function ProfilePage() {
    const {accessToken, user, logout, authFetch} = useAuth();

    const [meLoading, setMeLoading] = useState(true);
    const [meError, setMeError] = useState('');
    const [meSaved, setMeSaved] = useState('');

    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
    });

    const [addrLoading, setAddrLoading] = useState(true);
    const [addrError, setAddrError] = useState('');
    const [addrSaved, setAddrSaved] = useState('');
    const [addresses, setAddresses] = useState([]);

    const [addrEditId, setAddrEditId] = useState(null);
    const [addrForm, setAddrForm] = useState({
        label: '',
        city: '',
        address_line: '',
        recipient_name: '',
        phone: '',
        comment: '',
        is_default: false,
    });

    const [ordersLoading, setOrdersLoading] = useState(true);
    const [ordersError, setOrdersError] = useState('');
    const [orders, setOrders] = useState([]);

    const [addrTouched, setAddrTouched] = useState(false);
    const [addrInvalid, setAddrInvalid] = useState({
        label: false,
        city: false,
        phone: false,
        address_line: false,
    });

    const loadMe = async () => {
        setMeError('');
        setMeSaved('');
        setMeLoading(true);

        try {
            const res = await authFetch('/api/users/me/', {method: 'GET'});

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                throw new Error('Не удалось загрузить профиль');
            }

            const data = await res.json();

            setForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                email: data.email || '',
            });
        } catch (e) {
            setMeError(e?.message || 'Ошибка');
        } finally {
            setMeLoading(false);
        }
    };

    const saveMe = async () => {
        setMeError('');
        setMeSaved('');

        try {
            const res = await authFetch('/api/users/me/', {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    first_name: form.first_name,
                    last_name: form.last_name,
                    email: form.email,
                }),
            });

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || 'Не удалось сохранить');
            }

            setMeSaved('Изменения сохранены');
            setEditMode(false);
            await loadMe();
        } catch (e) {
            setMeError(e?.message || 'Ошибка');
        }
    };

    const loadAddresses = async () => {
        setAddrError('');
        setAddrSaved('');
        setAddrLoading(true);

        try {
            const res = await authFetch('/api/users/addresses/', {method: 'GET'});

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                throw new Error('Не удалось загрузить адреса');
            }

            const data = await res.json();
            setAddresses(Array.isArray(data) ? data : []);
        } catch (e) {
            setAddrError(e?.message || 'Ошибка');
        } finally {
            setAddrLoading(false);
        }
    };

    const resetAddrForm = () => {
        setAddrEditId(null);
        setAddrForm({
            label: '',
            city: '',
            address_line: '',
            recipient_name: '',
            phone: '',
            comment: '',
            is_default: false,
        });
        setAddrTouched(false);
        setAddrInvalid({
            label: false,
            city: false,
            phone: false,
            address_line: false,
        });
    };

    const startEditAddress = (a) => {
        setAddrSaved('');
        setAddrError('');
        setAddrEditId(a.id);
        setAddrTouched(false);
        setAddrInvalid({
            label: false,
            city: false,
            phone: false,
            address_line: false,
        });

        setAddrForm({
            label: a.label || '',
            city: a.city || '',
            address_line: a.address_line || '',
            recipient_name: a.recipient_name || '',
            phone: a.phone || '',
            comment: a.comment || '',
            is_default: !!a.is_default,
        });
    };

    const validateAddr = () => {
        const next = {
            label: isBlank(addrForm.label),
            city: isBlank(addrForm.city),
            phone: isBlank(addrForm.phone),
            address_line: isBlank(addrForm.address_line),
        };
        setAddrInvalid(next);
        return !(next.label || next.city || next.phone || next.address_line);
    };

    const onAddrChange = (patch) => {
        setAddrForm(prev => {
            const next = {...prev, ...patch};

            if (addrTouched) {
                setAddrInvalid({
                    label: isBlank(next.label),
                    city: isBlank(next.city),
                    phone: isBlank(next.phone),
                    address_line: isBlank(next.address_line),
                });
            }

            return next;
        });
    };

    const submitAddress = async () => {
        setAddrError('');
        setAddrSaved('');
        setAddrTouched(true);

        if (!validateAddr()) {
            setAddrError('Заполни обязательные поля');
            return;
        }

        const payload = {
            label: addrForm.label,
            city: addrForm.city,
            address_line: addrForm.address_line,
            recipient_name: addrForm.recipient_name,
            phone: addrForm.phone,
            comment: addrForm.comment,
            is_default: !!addrForm.is_default,
        };

        try {
            const url = addrEditId
                ? `/api/users/addresses/${addrEditId}/`
                : '/api/users/addresses/';

            const method = addrEditId ? 'PATCH' : 'POST';

            const res = await authFetch(url, {
                method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || 'Не удалось сохранить адрес');
            }

            setAddrSaved(addrEditId ? 'Адрес обновлён' : 'Адрес добавлен');
            resetAddrForm();
            await loadAddresses();
        } catch (e) {
            setAddrError(e?.message || 'Ошибка');
        }
    };

    const removeAddress = async (id) => {
        setAddrError('');
        setAddrSaved('');

        try {
            const res = await authFetch(`/api/users/addresses/${id}/`, {method: 'DELETE'});

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || 'Не удалось удалить адрес');
            }

            setAddrSaved('Адрес удалён');
            if (addrEditId === id) resetAddrForm();
            await loadAddresses();
        } catch (e) {
            setAddrError(e?.message || 'Ошибка');
        }
    };

    const loadOrders = async () => {
        setOrdersError('');
        setOrdersLoading(true);

        try {
            const res = await authFetch('/api/orders/my/', {method: 'GET'});

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                throw new Error('Не удалось загрузить заказы');
            }

            const data = await res.json();
            setOrders(Array.isArray(data) ? data : []);
        } catch (e) {
            setOrdersError(e?.message || 'Ошибка');
        } finally {
            setOrdersLoading(false);
        }
    };

    useEffect(() => {
        if (!accessToken) return;
        loadMe();
        loadAddresses();
        loadOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    useEffect(() => {
        setForm({
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            email: user?.email || '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Профиль</h1>
                    <div className={styles.sub}>
                        {user?.username ? `Логин: ${user.username}` : ''}
                    </div>
                </div>

                <div className={styles.headerRight}>
                    <button className={styles.btnDark} onClick={logout} type="button">
                        Выйти
                    </button>
                </div>
            </div>

            {(meSaved || meError || addrSaved || addrError || ordersError) && (
                <div className={styles.notices}>
                    {meSaved && (
                        <div className={`${styles.notice} ${styles.noticeOk}`}>
                            <span>{meSaved}</span>
                            <button className={styles.noticeClose} onClick={() => setMeSaved('')} type="button">×
                            </button>
                        </div>
                    )}
                    {meError && (
                        <div className={`${styles.notice} ${styles.noticeErr}`}>
                            <span>{meError}</span>
                            <button className={styles.noticeClose} onClick={() => setMeError('')} type="button">×
                            </button>
                        </div>
                    )}
                    {addrSaved && (
                        <div className={`${styles.notice} ${styles.noticeOk}`}>
                            <span>{addrSaved}</span>
                            <button className={styles.noticeClose} onClick={() => setAddrSaved('')} type="button">×
                            </button>
                        </div>
                    )}
                    {addrError && (
                        <div className={`${styles.notice} ${styles.noticeErr}`}>
                            <span>{addrError}</span>
                            <button className={styles.noticeClose} onClick={() => setAddrError('')} type="button">×
                            </button>
                        </div>
                    )}
                    {ordersError && (
                        <div className={`${styles.notice} ${styles.noticeErr}`}>
                            <span>{ordersError}</span>
                            <button className={styles.noticeClose} onClick={() => setOrdersError('')} type="button">×
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className={styles.layout}>
                <div className={styles.leftCol}>
                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Мои данные</div>
                                <div className={styles.cardHint}>Используются при оформлении заказа</div>
                            </div>

                            <div className={styles.cardActions}>
                                {!editMode ? (
                                    <button className={styles.btnDark} onClick={() => setEditMode(true)} type="button">
                                        Редактировать
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className={styles.btnLight}
                                            onClick={() => {
                                                setEditMode(false);
                                                loadMe();
                                            }}
                                            type="button"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            className={styles.btnDark}
                                            onClick={saveMe}
                                            disabled={meLoading}
                                            type="button"
                                        >
                                            Сохранить
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {meLoading ? (
                            <div className={styles.skeleton}>Загрузка…</div>
                        ) : (
                            <div className={styles.form}>
                                <div className={styles.row}>
                                    <div className={styles.label}>Имя</div>
                                    <div className={styles.control}>
                                        {!editMode ? (
                                            <div className={styles.value}>{form.first_name || '—'}</div>
                                        ) : (
                                            <input
                                                className={styles.input}
                                                value={form.first_name}
                                                onChange={(e) => setForm(prev => ({
                                                    ...prev,
                                                    first_name: e.target.value
                                                }))}
                                                placeholder="Имя"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.label}>Фамилия</div>
                                    <div className={styles.control}>
                                        {!editMode ? (
                                            <div className={styles.value}>{form.last_name || '—'}</div>
                                        ) : (
                                            <input
                                                className={styles.input}
                                                value={form.last_name}
                                                onChange={(e) => setForm(prev => ({
                                                    ...prev,
                                                    last_name: e.target.value
                                                }))}
                                                placeholder="Фамилия"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.label}>Логин</div>
                                    <div className={styles.control}>
                                        <div className={styles.value}>{user?.username || '—'}</div>
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.label}>Email</div>
                                    <div className={styles.control}>
                                        {!editMode ? (
                                            <div className={styles.value}>{form.email || '—'}</div>
                                        ) : (
                                            <input
                                                className={styles.input}
                                                value={form.email}
                                                onChange={(e) => setForm(prev => ({...prev, email: e.target.value}))}
                                                placeholder="Email"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className={`${styles.card} ${styles.stickyCard}`}>
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>
                                    {addrEditId ? `Редактирование адреса` : 'Новый адрес'}
                                </div>
                                <div className={styles.cardHint}>
                                    {addrEditId ? (
                                        <>
                                            Сейчас редактируешь: <b>{addrForm.label || `Адрес #${addrEditId}`}</b>
                                        </>
                                    ) : (
                                        <>Сохрани адрес — быстрее оформление</>
                                    )}
                                </div>
                            </div>

                            <div className={styles.cardActions}>
                                {addrEditId ? (
                                    <button className={styles.btnLight} onClick={resetAddrForm} type="button">
                                        Создать новый
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className={styles.stack}>
                            <div className={styles.reqRow}>
                                <span className={styles.reqStar}>*</span>
                                <span className={styles.reqText}>— обязательные поля</span>
                            </div>

                            <div className={styles.fieldBlock}>
                                <div className={styles.fieldLabel}>
                                    Название <span className={styles.reqStar}>*</span>
                                </div>
                                <input
                                    className={`${styles.input} ${(addrTouched && addrInvalid.label) ? styles.inputError : ''}`}
                                    value={addrForm.label}
                                    onChange={(e) => onAddrChange({label: e.target.value})}
                                    placeholder="Например: Дом / Офис"
                                />
                            </div>

                            <div className={styles.row2}>
                                <div className={styles.fieldBlock}>
                                    <div className={styles.fieldLabel}>
                                        Город <span className={styles.reqStar}>*</span>
                                    </div>
                                    <input
                                        className={`${styles.input} ${(addrTouched && addrInvalid.city) ? styles.inputError : ''}`}
                                        value={addrForm.city}
                                        onChange={(e) => onAddrChange({city: e.target.value})}
                                        placeholder="Город"
                                    />
                                </div>

                                <div className={styles.fieldBlock}>
                                    <div className={styles.fieldLabel}>
                                        Телефон <span className={styles.reqStar}>*</span>
                                    </div>
                                    <input
                                        className={`${styles.input} ${(addrTouched && addrInvalid.phone) ? styles.inputError : ''}`}
                                        value={addrForm.phone}
                                        onChange={(e) => onAddrChange({phone: e.target.value})}
                                        placeholder="+7..."
                                    />
                                </div>
                            </div>

                            <div className={styles.fieldBlock}>
                                <div className={styles.fieldLabel}>
                                    Улица, дом, квартира <span className={styles.reqStar}>*</span>
                                </div>
                                <input
                                    className={`${styles.input} ${(addrTouched && addrInvalid.address_line) ? styles.inputError : ''}`}
                                    value={addrForm.address_line}
                                    onChange={(e) => onAddrChange({address_line: e.target.value})}
                                    placeholder="Улица, дом, квартира"
                                />
                            </div>

                            <div className={styles.fieldBlock}>
                                <div className={styles.fieldLabel}>Получатель</div>
                                <input
                                    className={styles.input}
                                    value={addrForm.recipient_name}
                                    onChange={(e) => onAddrChange({recipient_name: e.target.value})}
                                    placeholder="Необязательно"
                                />
                            </div>

                            <div className={styles.fieldBlock}>
                                <div className={styles.fieldLabel}>Комментарий</div>
                                <input
                                    className={styles.input}
                                    value={addrForm.comment}
                                    onChange={(e) => onAddrChange({comment: e.target.value})}
                                    placeholder="Подъезд/код/этаж — необязательно"
                                />
                            </div>

                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={addrForm.is_default}
                                    onChange={(e) => onAddrChange({is_default: e.target.checked})}
                                />
                                Сделать основным
                            </label>

                            <div className={styles.actionsRow}>
                                {addrEditId ? (
                                    <button className={styles.btnLight} onClick={resetAddrForm} type="button">
                                        Отмена
                                    </button>
                                ) : null}

                                <button
                                    className={styles.btnDark}
                                    onClick={submitAddress}
                                    disabled={addrLoading}
                                    type="button"
                                >
                                    {addrEditId ? 'Сохранить' : 'Добавить'}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>

                <div className={styles.rightCol}>
                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Адреса</div>
                                <div className={styles.cardHint}>
                                    Нажми “Изменить”, чтобы отредактировать адрес в левой форме
                                </div>
                            </div>
                        </div>

                        {addrLoading ? (
                            <div className={styles.skeleton}>Загрузка…</div>
                        ) : addresses.length === 0 ? (
                            <div className={styles.empty}>Адресов пока нет</div>
                        ) : (
                            <div className={styles.addressList}>
                                {addresses.map(a => (
                                    <div className={styles.addressCard} key={a.id}>
                                        <div className={styles.addressTop}>
                                            <div className={styles.addressTitle}>
                                                <span className={styles.addressTitleText}>
                                                    {a.label ? a.label : `Адрес #${a.id}`}
                                                </span>
                                                {a.is_default && <span className={styles.badge}>Основной</span>}
                                            </div>

                                            <div className={styles.addressActions}>
                                                <button
                                                    className={styles.btnLight}
                                                    onClick={() => startEditAddress(a)}
                                                    type="button"
                                                >
                                                    Изменить
                                                </button>
                                                <button
                                                    className={styles.btnDangerLight}
                                                    onClick={() => removeAddress(a.id)}
                                                    type="button"
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                        </div>

                                        <div className={styles.addressBody}>
                                            <div className={styles.addressLine}><b>{a.city || '—'}</b></div>
                                            <div className={styles.addressLine}>{a.address_line || '—'}</div>

                                            {(a.recipient_name || a.phone) && (
                                                <div className={styles.metaRow}>
                                                    {a.recipient_name && <span>Получатель: {a.recipient_name}</span>}
                                                    {a.phone && <span>Телефон: {a.phone}</span>}
                                                </div>
                                            )}

                                            {a.comment && <div className={styles.comment}>{a.comment}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Мои заказы</div>
                                <div className={styles.cardHint}>Статусы, доставка и состав заказа</div>
                            </div>
                        </div>

                        {ordersLoading ? (
                            <div className={styles.skeleton}>Загрузка…</div>
                        ) : orders.length === 0 ? (
                            <div className={styles.empty}>Заказов пока нет</div>
                        ) : (
                            <div className={styles.ordersList}>
                                {orders.map(o => {
                                    const items = Array.isArray(o.items) ? o.items : [];
                                    const itemsCount = items.reduce((acc, it) => acc + Number(it?.quantity || 0), 0);

                                    const created = o.created_at ? new Date(o.created_at) : null;
                                    const createdText = created
                                        ? created.toLocaleString('ru-RU', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })
                                        : '';

                                    const statusUi = (() => {
                                        const map = {
                                            new: {
                                                tone: styles.stNew,
                                                title: 'Новый',
                                                desc: 'Мы получили заказ и начали обработку.'
                                            },
                                            paid: {
                                                tone: styles.stPaid,
                                                title: 'Оплачен',
                                                desc: 'Оплата подтверждена. Готовим к отправке.'
                                            },
                                            shipped: {
                                                tone: styles.stShipped,
                                                title: 'Доставляется',
                                                desc: 'Заказ передан в доставку.'
                                            },
                                            completed: {
                                                tone: styles.stCompleted,
                                                title: 'Выполнен',
                                                desc: 'Заказ доставлен и завершён.'
                                            },
                                            canceled: {
                                                tone: styles.stCanceled,
                                                title: 'Отменён',
                                                desc: 'Заказ отменён.'
                                            },
                                            processing: {
                                                tone: styles.stProcessing,
                                                title: 'В обработке',
                                                desc: 'Собираем заказ на складе.'
                                            },
                                        };
                                        return map[o.status] || {
                                            tone: styles.stProcessing,
                                            title: statusLabel(o.status),
                                            desc: ''
                                        };
                                    })();

                                    const deliveryText = deliveryLabel(o.delivery_type);
                                    const deliveryPriceText = o.delivery_price != null ? `${formatMoney(o.delivery_price)} ₽` : '—';

                                    const pickup = o.pickup_point_data;
                                    const pickupLine = pickup?.name ? `${pickup.name}${pickup.address ? ` • ${pickup.address}` : ''}` : '';

                                    const courierLine = [
                                        o.delivery_city ? o.delivery_city : '',
                                        o.delivery_address_text ? o.delivery_address_text : '',
                                    ].filter(Boolean).join(', ');

                                    const serviceLine = o.delivery_service ? o.delivery_service : '';

                                    const productsTotal = items.reduce((sum, it) => {
                                        const q = Number(it?.quantity || 0);
                                        const p = Number(it?.price_snapshot ?? it?.price ?? 0);
                                        return sum + q * p;
                                    }, 0);

                                    return (
                                        <details className={styles.orderCard} key={o.id}>
                                            <summary className={styles.orderSummary}>
                                                <div className={styles.sumLeft}>
                                                    <div className={styles.sumTop}>
                                                        <div className={styles.orderId}>Заказ #{o.id}</div>
                                                        {createdText ? <div
                                                            className={styles.orderDate}>{createdText}</div> : null}
                                                    </div>

                                                    <div className={styles.sumBottom}>
                                    <span className={`${styles.statusPill} ${statusUi.tone}`}>
                                        <span className={styles.statusTitle}>{statusUi.title}</span>
                                    </span>

                                                        <span className={styles.chip}>
                                        {deliveryText}
                                    </span>

                                                        {itemsCount ? (
                                                            <span className={styles.chipMuted}>
                                            {itemsCount} шт.
                                        </span>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <div className={styles.sumRight}>
                                                    <div className={styles.sumTotal}>{formatMoney(o.total_amount)} ₽
                                                    </div>
                                                    <div className={styles.sumSub}>
                                                        Товары: {formatMoney(productsTotal)} ₽
                                                        <span className={styles.dot}>•</span>
                                                        Доставка: {deliveryPriceText}
                                                    </div>
                                                </div>
                                            </summary>

                                            <div className={styles.orderBody}>
                                                <div className={styles.orderBodyTop}>
                                                    <div className={styles.statusBlock}>
                                                        <div className={styles.statusHead}>
                                                            <span className={`${styles.statusDot} ${statusUi.tone}`}/>
                                                            <div className={styles.statusText}>
                                                                <div
                                                                    className={styles.statusLine1}>{statusUi.title}</div>
                                                                {statusUi.desc ? <div
                                                                    className={styles.statusLine2}>{statusUi.desc}</div> : null}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className={styles.deliveryBlock}>
                                                        <div className={styles.blockTitle}>Доставка</div>

                                                        <div className={styles.blockRow}>
                                                            <div className={styles.blockKey}>Способ</div>
                                                            <div className={styles.blockVal}>
                                                                {deliveryText}
                                                                {serviceLine ? <span
                                                                    className={styles.blockValSub}>{serviceLine}</span> : null}
                                                            </div>
                                                        </div>

                                                        {o.delivery_type === 'pvz' && pickupLine ? (
                                                            <div className={styles.blockRow}>
                                                                <div className={styles.blockKey}>ПВЗ</div>
                                                                <div className={styles.blockVal}>{pickupLine}</div>
                                                            </div>
                                                        ) : null}

                                                        {o.delivery_type === 'store_pickup' && pickupLine ? (
                                                            <div className={styles.blockRow}>
                                                                <div className={styles.blockKey}>Самовывоз</div>
                                                                <div className={styles.blockVal}>{pickupLine}</div>
                                                            </div>
                                                        ) : null}

                                                        {o.delivery_type === 'courier' && courierLine ? (
                                                            <div className={styles.blockRow}>
                                                                <div className={styles.blockKey}>Адрес</div>
                                                                <div className={styles.blockVal}>{courierLine}</div>
                                                            </div>
                                                        ) : null}

                                                        <div className={styles.blockRow}>
                                                            <div className={styles.blockKey}>Стоимость</div>
                                                            <div className={styles.blockVal}>{deliveryPriceText}</div>
                                                        </div>

                                                        {o.comment ? (
                                                            <div className={styles.blockRow}>
                                                                <div className={styles.blockKey}>Комментарий</div>
                                                                <div className={styles.blockVal}>{o.comment}</div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                {items.length > 0 ? (
                                                    <div className={styles.itemsBlock}>
                                                        <div className={styles.itemsHead}>
                                                            <div className={styles.blockTitle}>Состав заказа</div>
                                                            <div className={styles.itemsHint}>Нажми на заказ, чтобы
                                                                свернуть/развернуть
                                                            </div>
                                                        </div>

                                                        <div className={styles.itemsTable}>
                                                            {items.map((it, idx) => {
                                                                const name = it.product_name_snapshot || it.product_name || 'Товар';
                                                                const qty = Number(it.quantity || 0);
                                                                const price = Number(it.price_snapshot ?? it.price ?? 0);
                                                                const rowSum = qty * price;

                                                                return (
                                                                    <div className={styles.itemRow}
                                                                         key={`${o.id}-${idx}`}>
                                                                        <div className={styles.itemName}>{name}</div>
                                                                        <div className={styles.itemMeta}>
                                                                            <span
                                                                                className={styles.itemQty}>{qty} шт.</span>
                                                                            <span
                                                                                className={styles.itemPrice}>{formatMoney(price)} ₽</span>
                                                                            <span
                                                                                className={styles.itemSum}>{formatMoney(rowSum)} ₽</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={styles.empty}>Состав заказа пуст</div>
                                                )}
                                            </div>
                                        </details>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}