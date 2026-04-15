import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import styles from '../styles/ProfilePage.module.css';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';
import {useCart} from '../store/cartContext';

function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
}

function statusLabel(status, paymentSucceeded = false) {
    if (!status) return '';
    const map = {
        new: paymentSucceeded ? 'Новый' : 'Ожидает оплаты',
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

function normalizePhone(value) {
    const input = String(value || '');
    const trimmed = input.trim();
    const startsWithPlus = trimmed.startsWith('+');
    const hasUserPlusSeven = /^\+?\s*7/.test(trimmed);

    const digits = input.replace(/\D/g, '');
    let local = digits;
    if (local.startsWith('7') || local.startsWith('8')) {
        local = local.slice(1);
    }
    local = local.slice(0, 10);

    if (!trimmed) return '';
    if (!local && (hasUserPlusSeven || startsWithPlus)) return '+7';
    if (!local) return '';

    let out = '+7';
    if (local.length > 0) {
        out += ` (${local.slice(0, Math.min(3, local.length))}`;
    }
    if (local.length > 3) {
        out += ')';
        out += ` ${local.slice(3, Math.min(6, local.length))}`;
    }
    if (local.length > 6) out += `-${local.slice(6, Math.min(8, local.length))}`;
    if (local.length > 8) out += `-${local.slice(8, 10)}`;
    return out;
}

function phoneIsValid(value) {
    const text = String(value || '').trim();
    const digits = text.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('7');
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const {accessToken, user, logout, authFetch, reloadUser} = useAuth();
    const {cart, repeatOrder} = useCart();
    const notify = useNotify();

    const [meLoading, setMeLoading] = useState(true);
    const [meError, setMeError] = useState('');
    const [meSaved, setMeSaved] = useState('');

    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
    });
    const [emailDraft, setEmailDraft] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [emailCodeRequested, setEmailCodeRequested] = useState(false);
    const [emailFlowLoading, setEmailFlowLoading] = useState(false);
    const [emailCodeSubmitted, setEmailCodeSubmitted] = useState(false);
    const [emailResendAt, setEmailResendAt] = useState(0);
    const [emailNowTs, setEmailNowTs] = useState(Date.now());

    const [addrLoading, setAddrLoading] = useState(true);
    const [addrError, setAddrError] = useState('');
    const [addrSaved, setAddrSaved] = useState('');
    const [addresses, setAddresses] = useState([]);

    const [addrEditId, setAddrEditId] = useState(null);
    const [addrModalOpen, setAddrModalOpen] = useState(false);
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
    const [reorderLoadingId, setReorderLoadingId] = useState(null);

    const [addrTouched, setAddrTouched] = useState(false);
    const [addrInvalid, setAddrInvalid] = useState({
        label: false,
        city: false,
        phone: false,
        address_line: false,
    });

    const loadMe = async () => {
        setMeError('');
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
            setEmailDraft(data.email || '');
            setEmailCode('');
            setEmailCodeRequested(false);
            setEmailCodeSubmitted(false);
            setEmailResendAt(0);
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
            await reloadUser().catch(() => null);
            await loadMe();
        } catch (e) {
            setMeError(e?.message || 'Ошибка');
        }
    };

    const sendEmailChangeCode = async () => {
        setMeError('');
        setMeSaved('');

        const nextEmail = String(emailDraft || '').trim();
        if (!nextEmail) {
            setMeError('Введите новый email');
            return;
        }
        if (nextEmail.toLowerCase() === String(form.email || '').trim().toLowerCase()) {
            setMeError('Укажите другой email');
            return;
        }
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(nextEmail)) {
            setMeError('Введите корректный email');
            return;
        }

        setEmailFlowLoading(true);
        try {
            const res = await authFetch('/api/users/email-change/request/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({new_email: nextEmail}),
            });

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || 'Не удалось отправить код');
            }

            const data = await res.json();
            const retryAfter = Number(data?.retry_after || 60);
            setEmailNowTs(Date.now());
            setEmailResendAt(Date.now() + retryAfter * 1000);
            setEmailCodeRequested(true);
            setEmailCode('');
            setEmailCodeSubmitted(false);
            setMeSaved('Код подтверждения отправлен на новый email');
        } catch (e) {
            setMeError(e?.message || 'Ошибка');
        } finally {
            setEmailFlowLoading(false);
        }
    };

    const confirmEmailChange = async () => {
        setEmailCodeSubmitted(true);
        setMeError('');
        setMeSaved('');

        const code = String(emailCode || '').replace(/\D+/g, '');
        if (code.length !== 6) {
            setMeError('Введите 6-значный код');
            return;
        }

        setEmailFlowLoading(true);
        try {
            const res = await authFetch('/api/users/email-change/confirm/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({code}),
            });

            if (res.status === 401) {
                await logout();
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || 'Не удалось подтвердить email');
            }

            const data = await res.json().catch(() => ({}));
            setForm(prev => ({...prev, email: data?.email || emailDraft.trim()}));
            setEmailDraft(data?.email || emailDraft.trim());
            setEmailCode('');
            setEmailCodeRequested(false);
            setEmailCodeSubmitted(false);
            setEmailResendAt(0);
            setMeSaved('Email успешно обновлён');
            setEditMode(false);
            await reloadUser().catch(() => null);
            await loadMe();
        } catch (e) {
            setMeError(e?.message || 'Ошибка');
        } finally {
            setEmailFlowLoading(false);
        }
    };

    const loadAddresses = async () => {
        setAddrError('');
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

    const openCreateAddress = () => {
        resetAddrForm();
        setAddrSaved('');
        setAddrError('');
        setAddrModalOpen(true);
    };

    const closeAddressModal = () => {
        setAddrModalOpen(false);
        resetAddrForm();
    };

    const startEditAddress = (a) => {
        setAddrSaved('');
        setAddrError('');
        setAddrEditId(a.id);
        setAddrModalOpen(true);
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
            phone: normalizePhone(a.phone || ''),
            comment: a.comment || '',
            is_default: !!a.is_default,
        });
    };

    const validateAddr = () => {
        const normalizedPhone = normalizePhone(addrForm.phone);
        const next = {
            label: isBlank(addrForm.label),
            city: isBlank(addrForm.city),
            phone: isBlank(normalizedPhone) || !phoneIsValid(normalizedPhone),
            address_line: isBlank(addrForm.address_line),
        };
        setAddrInvalid(next);
        return !(next.label || next.city || next.phone || next.address_line);
    };

    const onAddrChange = (patch) => {
        setAddrForm(prev => {
            const nextPatch = {...patch};
            if (Object.prototype.hasOwnProperty.call(nextPatch, 'phone')) {
                nextPatch.phone = normalizePhone(nextPatch.phone);
            }
            const next = {...prev, ...nextPatch};

            if (addrTouched) {
                setAddrInvalid({
                    label: isBlank(next.label),
                    city: isBlank(next.city),
                    phone: isBlank(next.phone) || !phoneIsValid(next.phone),
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
            if (!isBlank(addrForm.phone) && !phoneIsValid(addrForm.phone)) {
                setAddrError('Телефон должен быть в формате +7 (___) ___-__-__');
            } else {
                setAddrError('Заполни обязательные поля');
            }
            return;
        }

        const payload = {
            label: addrForm.label,
            city: addrForm.city,
            address_line: addrForm.address_line,
            recipient_name: addrForm.recipient_name,
            phone: normalizePhone(addrForm.phone),
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
            closeAddressModal();
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

    const handleRepeatOrder = async (orderId) => {
        if (!orderId || reorderLoadingId) return;

        if (cart.length > 0) {
            const ok = window.confirm(
                'Текущая корзина будет заменена товарами из выбранного заказа. Продолжить?'
            );
            if (!ok) return;
        }

        setReorderLoadingId(orderId);
        try {
            const data = await repeatOrder(orderId, {replace: true});

            const detail = data?.detail || 'Товары из заказа добавлены в корзину';
            const skipped = Number(data?.skipped_positions || 0);
            const partial = Number(data?.partial_positions || 0);
            const added = Number(data?.added_positions || 0);

            if (added <= 0) {
                notify.error(detail);
                return;
            }

            if (skipped > 0 || partial > 0) {
                notify.warning(`${detail}. Добавлено позиций: ${added}, пропущено: ${skipped}.`);
            } else {
                notify.success(detail);
            }

            navigate('/cart');
        } catch (e) {
            const detail = e?.payload?.detail || e?.message || 'Не удалось повторить заказ';
            const skipped = Number(e?.payload?.skipped_positions || 0);
            if (skipped > 0) {
                notify.error(`${detail}. Недоступно позиций: ${skipped}.`);
            } else {
                notify.error(detail);
            }
        } finally {
            setReorderLoadingId(null);
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
        setEmailDraft(user?.email || '');
    }, [user]);

    useEffect(() => {
        if (!emailCodeRequested) return undefined;
        if (emailResendAt <= Date.now()) return undefined;

        const timer = setInterval(() => {
            setEmailNowTs(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, [emailCodeRequested, emailResendAt]);

    const emailResendLeft = Math.max(0, Math.ceil((emailResendAt - emailNowTs) / 1000));

    useEffect(() => {
        if (meSaved) notify.success(meSaved);
    }, [meSaved, notify]);

    useEffect(() => {
        if (meError) notify.error(meError);
    }, [meError, notify]);

    useEffect(() => {
        if (addrSaved) notify.success(addrSaved);
    }, [addrSaved, notify]);

    useEffect(() => {
        if (addrError) notify.error(addrError);
    }, [addrError, notify]);

    useEffect(() => {
        if (ordersError) notify.error(ordersError);
    }, [ordersError, notify]);

    useEffect(() => {
        if (!addrModalOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeAddressModal();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addrModalOpen]);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Профиль</h1>
                </div>

                <div className={styles.headerRight}>
                    <button className={styles.btnDark} onClick={() => logout({silent: false})} type="button">
                        Выйти
                    </button>
                </div>
            </div>

            <div className={styles.layout}>
                <div className={styles.leftCol}>
                    <section
                        className={`${styles.card} ${meLoading ? styles.loadingProfileCard : ''}`}
                        aria-busy={meLoading}
                    >
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Мои данные</div>
                            </div>

                            <div className={styles.cardActions}>
                                {!editMode ? (
                                    <button
                                        className={styles.btnDark}
                                        onClick={() => {
                                            setMeError('');
                                            setMeSaved('');
                                            setEmailDraft('');
                                            setEmailCode('');
                                            setEmailCodeRequested(false);
                                            setEmailCodeSubmitted(false);
                                            setEmailResendAt(0);
                                            setEditMode(true);
                                        }}
                                        type="button"
                                    >
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
                            <div className={styles.profileSkeleton}>
                                <div className={styles.profileSkeletonGrid}>
                                    {[0, 1, 2, 3].map((i) => (
                                        <div className={styles.profileSkeletonCell} key={`profile-sk-${i}`}>
                                            <div className={styles.skLabel}/>
                                            <div className={styles.skLine}/>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.skInput}/>
                                <div className={styles.skInput}/>
                            </div>
                        ) : (
                            <div className={styles.profileForm}>
                                {!editMode ? (
                                    <div className={styles.profileViewGrid}>
                                        <div className={styles.profileViewCell}>
                                            <div className={styles.profileViewLabel}>Имя</div>
                                            <div className={styles.profileViewValue}>{form.first_name || '—'}</div>
                                        </div>
                                        <div className={styles.profileViewCell}>
                                            <div className={styles.profileViewLabel}>Фамилия</div>
                                            <div className={styles.profileViewValue}>{form.last_name || '—'}</div>
                                        </div>
                                        <div className={styles.profileViewCell}>
                                            <div className={styles.profileViewLabel}>Логин</div>
                                            <div className={styles.profileViewValue}>{user?.username || '—'}</div>
                                        </div>
                                        <div className={styles.profileViewCell}>
                                            <div className={styles.profileViewLabel}>Email</div>
                                            <div className={styles.profileViewValue}>{form.email || '—'}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className={styles.row2}>
                                            <div className={styles.fieldBlock}>
                                                <div className={styles.fieldLabel}>Имя</div>
                                                <input
                                                    className={styles.input}
                                                    value={form.first_name}
                                                    onChange={(e) => setForm(prev => ({
                                                        ...prev,
                                                        first_name: e.target.value
                                                    }))}
                                                    placeholder="Имя"
                                                />
                                            </div>
                                            <div className={styles.fieldBlock}>
                                                <div className={styles.fieldLabel}>Фамилия</div>
                                                <input
                                                    className={styles.input}
                                                    value={form.last_name}
                                                    onChange={(e) => setForm(prev => ({
                                                        ...prev,
                                                        last_name: e.target.value
                                                    }))}
                                                    placeholder="Фамилия"
                                                />
                                            </div>
                                        </div>

                                        <div className={styles.fieldBlock}>
                                            <div className={styles.fieldLabel}>Логин</div>
                                            <div className={styles.readonlyValue}>{user?.username || '—'}</div>
                                        </div>

                                        <div className={styles.emailPanel}>
                                            <div className={styles.emailPanelHead}>
                                                <div className={styles.emailPanelTitle}>Смена email</div>
                                                <div className={styles.emailPanelHint}>
                                                    Текущий email: {form.email || '—'}
                                                </div>
                                            </div>

                                            <div className={styles.emailSendRow}>
                                                <input
                                                    className={styles.input}
                                                    value={emailDraft}
                                                    onChange={(e) => setEmailDraft(e.target.value)}
                                                    placeholder="Новый email"
                                                    type="email"
                                                />
                                                <button
                                                    className={styles.btnLight}
                                                    onClick={sendEmailChangeCode}
                                                    disabled={emailFlowLoading}
                                                    type="button"
                                                >
                                                    {emailFlowLoading ? 'Отправляем…' : 'Отправить код'}
                                                </button>
                                            </div>

                                            <div className={styles.emailConfirmSlot}>
                                                {emailCodeRequested ? (
                                                    <div className={styles.emailConfirmBox}>
                                                        <input
                                                            className={`${styles.input} ${emailCodeSubmitted && String(emailCode || '').replace(/\D+/g, '').length !== 6 ? styles.inputError : ''}`}
                                                            value={emailCode}
                                                            onChange={(e) => setEmailCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                                                            placeholder="Код из письма (6 цифр)"
                                                            inputMode="numeric"
                                                        />
                                                        <div className={styles.actionsRow}>
                                                            <button
                                                                className={styles.btnDark}
                                                                onClick={confirmEmailChange}
                                                                disabled={emailFlowLoading}
                                                                type="button"
                                                            >
                                                                Подтвердить email
                                                            </button>
                                                            <button
                                                                className={styles.btnLight}
                                                                onClick={sendEmailChangeCode}
                                                                disabled={emailFlowLoading || emailResendLeft > 0}
                                                                type="button"
                                                            >
                                                                {emailResendLeft > 0
                                                                    ? `Повторить через ${emailResendLeft} с`
                                                                    : 'Отправить код снова'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={styles.emailHint}>
                                                        После отправки кода появится поле подтверждения.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    <section
                        className={`${styles.card} ${styles.compactCard} ${addrLoading ? styles.loadingAddressesCard : ''}`}
                        aria-busy={addrLoading}
                    >
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Адреса</div>
                            </div>
                            <div className={styles.cardActions}>
                                <button
                                    className={styles.btnDark}
                                    onClick={openCreateAddress}
                                    type="button"
                                >
                                    Добавить адрес
                                </button>
                            </div>
                        </div>

                        {addrLoading ? (
                            <div className={styles.addressSkeletonList}>
                                {[0, 1, 2].map((i) => (
                                    <div className={styles.addressSkeletonCard} key={`addr-sk-${i}`}>
                                        <div className={styles.addressSkeletonTop}>
                                            <div className={styles.skTitle}/>
                                            <div className={styles.addressSkeletonActions}>
                                                <div className={styles.skBtn}/>
                                                <div className={styles.skBtn}/>
                                            </div>
                                        </div>
                                        <div className={styles.skLine}/>
                                        <div className={styles.skLine}/>
                                        <div className={styles.skLineShort}/>
                                    </div>
                                ))}
                            </div>
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
                                                    {a.phone && <span>Телефон: {normalizePhone(a.phone) || a.phone}</span>}
                                                </div>
                                            )}

                                            {a.comment && <div className={styles.comment}>{a.comment}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <div className={styles.rightCol}>
                    <section
                        className={`${styles.card} ${ordersLoading ? styles.loadingOrdersCard : ''}`}
                        aria-busy={ordersLoading}
                    >
                        <div className={styles.cardHead}>
                            <div>
                                <div className={styles.cardTitle}>Мои заказы</div>
                            </div>
                        </div>

                        {ordersLoading ? (
                            <div className={styles.ordersSkeletonList}>
                                {[0, 1, 2].map((i) => (
                                    <div className={styles.orderSkeletonCard} key={`order-sk-${i}`}>
                                        <div className={styles.orderSkeletonSummary}>
                                            <div className={styles.orderSkeletonLeft}>
                                                <div className={styles.skTitle}/>
                                                <div className={styles.orderSkeletonBadges}>
                                                    <div className={styles.skBadge}/>
                                                    <div className={styles.skBadge}/>
                                                </div>
                                            </div>
                                            <div className={styles.orderSkeletonRight}>
                                                <div className={styles.skTotal}/>
                                                <div className={styles.skLineShort}/>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                                                tone: o.payment_succeeded ? styles.stNew : styles.stProcessing,
                                                title: o.payment_succeeded ? 'Новый' : 'Ожидает оплаты',
                                                desc: o.payment_succeeded
                                                    ? 'Оплата подтверждена. Заказ поступил в работу.'
                                                    : 'Ждем оплату заказа. Если оплата не поступит за 10 минут, заказ будет отменен.'
                                            },
                                            paid: {
                                                tone: styles.stPaid,
                                                title: 'Оплачен',
                                                desc: 'Оплата подтверждена. Заказ в очереди на сборку.'
                                            },
                                            shipped: {
                                                tone: styles.stShipped,
                                                title: 'Доставляется',
                                                desc: 'Заказ передан в службу доставки.'
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
                                            title: statusLabel(o.status, o.payment_succeeded),
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

                                    const itemsCountText = (() => {
                                        const mod10 = itemsCount % 10;
                                        const mod100 = itemsCount % 100;
                                        if (mod10 === 1 && mod100 !== 11) return `${itemsCount} позиция`;
                                        if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${itemsCount} позиции`;
                                        return `${itemsCount} позиций`;
                                    })();

                                    const uniqueItemsText = (() => {
                                        const n = items.length;
                                        const mod10 = n % 10;
                                        const mod100 = n % 100;
                                        if (mod10 === 1 && mod100 !== 11) return `${n} товар`;
                                        if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} товара`;
                                        return `${n} товаров`;
                                    })();

                                    const deliveryDetail = (() => {
                                        if (o.delivery_type === 'pvz' && pickupLine) return pickupLine;
                                        if (o.delivery_type === 'store_pickup' && pickupLine) return pickupLine;
                                        if (o.delivery_type === 'courier' && courierLine) return courierLine;
                                        return 'Детали доставки появятся после обработки заказа';
                                    })();

                                    const paymentStateText = o.payment_succeeded
                                        ? 'Оплата подтверждена'
                                        : (o.status === 'canceled' ? 'Оплата отменена' : 'Ожидается оплата');

                                    return (
                                        <details className={styles.orderCard} key={o.id}>
                                            <summary className={styles.orderSummary}>
                                                <div className={styles.orderSummaryLeft}>
                                                    <div className={styles.orderSummaryTop}>
                                                        <div className={styles.orderNumber}>Заказ #{o.id}</div>
                                                        {createdText ? <div className={styles.orderDate}>{createdText}</div> : null}
                                                    </div>

                                                    <div className={styles.orderBadges}>
                                                        <span className={`${styles.orderBadge} ${statusUi.tone}`}>
                                                            {statusUi.title}
                                                        </span>
                                                        <span className={`${styles.orderBadge} ${styles.badgeNeutral}`}>
                                                            {deliveryText}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className={styles.orderSummaryRight}>
                                                    <div className={styles.orderTotal}>{formatMoney(o.total_amount)} ₽</div>
                                                    <div className={styles.orderMetaMini}>
                                                        {itemsCountText}
                                                        <span className={styles.dot}>•</span>
                                                        Товары: {formatMoney(productsTotal)} ₽
                                                    </div>
                                                </div>
                                            </summary>

                                            <div className={styles.orderBody}>
                                                <div className={styles.orderInfoGrid}>
                                                    <div className={styles.orderInfoCard}>
                                                        <div className={styles.orderInfoTitle}>Статус заказа</div>
                                                        <div className={styles.orderInfoValue}>{statusUi.title}</div>
                                                        {statusUi.desc ? (
                                                            <div className={styles.orderInfoSub}>{statusUi.desc}</div>
                                                        ) : null}
                                                    </div>

                                                    <div className={styles.orderInfoCard}>
                                                        <div className={styles.orderInfoTitle}>Доставка</div>
                                                        <div className={styles.orderInfoValue}>{deliveryText}</div>
                                                        <div className={styles.orderInfoSub}>{deliveryDetail}</div>
                                                        {serviceLine ? (
                                                            <div className={styles.orderInfoMuted}>Служба: {serviceLine}</div>
                                                        ) : null}
                                                    </div>

                                                    <div className={styles.orderInfoCard}>
                                                        <div className={styles.orderInfoTitle}>Оплата и сумма</div>
                                                        <div className={styles.orderInfoValue}>{formatMoney(o.total_amount)} ₽</div>
                                                        <div className={styles.orderInfoSub}>
                                                            Товары: {formatMoney(productsTotal)} ₽
                                                        </div>
                                                        <div className={styles.orderInfoMuted}>
                                                            Доставка: {deliveryPriceText}
                                                        </div>
                                                        <div className={styles.orderInfoMuted}>
                                                            {paymentStateText}
                                                        </div>
                                                    </div>

                                                    <div className={styles.orderInfoCard}>
                                                        <div className={styles.orderInfoTitle}>Состав</div>
                                                        <div className={styles.orderInfoValue}>{itemsCountText}</div>
                                                        <div className={styles.orderInfoSub}>
                                                            {uniqueItemsText} в заказе
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={styles.orderActionsRow}>
                                                    <button
                                                        className={styles.orderActionBtn}
                                                        type="button"
                                                        onClick={() => handleRepeatOrder(o.id)}
                                                        disabled={reorderLoadingId === o.id}
                                                    >
                                                        {reorderLoadingId === o.id ? 'Добавляю в корзину…' : 'Повторить заказ'}
                                                    </button>
                                                </div>

                                                {items.length > 0 ? (
                                                    <div className={styles.itemsBlock}>
                                                        <div className={styles.itemsHeadNew}>
                                                            <div className={styles.itemsTitleNew}>Состав заказа</div>
                                                            <a className={styles.itemsActionLink} href="/catalog">
                                                                Перейти в каталог
                                                            </a>
                                                        </div>

                                                        <div className={styles.itemsListNew}>
                                                            {items.map((it, idx) => {
                                                                const name = it.product_name_snapshot || it.product_name || 'Товар';
                                                                const qty = Number(it.quantity || 0);
                                                                const price = Number(it.price_snapshot ?? it.price ?? 0);
                                                                const rowSum = qty * price;
                                                                const productUrl = it?.product_id ? `/product/${it.product_id}` : '';
                                                                const imageUrl = String(it?.image_url_snapshot || '').trim();

                                                                return (
                                                                    <div className={styles.orderItemCardNew} key={`${o.id}-${idx}`}>
                                                                        <div className={styles.orderItemMedia}>
                                                                            {imageUrl ? (
                                                                                productUrl ? (
                                                                                    <a href={productUrl} className={styles.orderItemImageLink}>
                                                                                        <img src={imageUrl} alt={name} className={styles.orderItemImage}/>
                                                                                    </a>
                                                                                ) : (
                                                                                    <img src={imageUrl} alt={name} className={styles.orderItemImage}/>
                                                                                )
                                                                            ) : (
                                                                                <div className={styles.orderItemImagePlaceholder}>Фото</div>
                                                                            )}
                                                                        </div>

                                                                        <div className={styles.orderItemMain}>
                                                                            {productUrl ? (
                                                                                <a href={productUrl} className={styles.orderItemNameLink}>
                                                                                    {name}
                                                                                </a>
                                                                            ) : (
                                                                                <div className={styles.orderItemNameText}>{name}</div>
                                                                            )}
                                                                        </div>

                                                                        <div className={styles.orderItemNums}>
                                                                            <div className={styles.orderItemNum}>{qty} шт.</div>
                                                                            <div className={styles.orderItemNum}>{formatMoney(price)} ₽</div>
                                                                            <div className={styles.orderItemNumStrong}>{formatMoney(rowSum)} ₽</div>
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

            {addrModalOpen ? (
                <div
                    className={styles.modalBackdrop}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) {
                            closeAddressModal();
                        }
                    }}
                >
                    <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="address-modal-title">
                        <div className={styles.modalHead}>
                            <div>
                                <h2 id="address-modal-title" className={styles.modalTitle}>
                                    {addrEditId ? 'Редактирование адреса' : 'Новый адрес'}
                                </h2>
                                <div className={styles.modalHint}>
                                    Заполни обязательные поля для доставки
                                </div>
                            </div>
                            <button className={styles.modalClose} onClick={closeAddressModal} type="button" aria-label="Закрыть">
                                ×
                            </button>
                        </div>

                        <form
                            className={styles.modalBody}
                            onSubmit={(e) => {
                                e.preventDefault();
                                submitAddress();
                            }}
                        >
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

                            <div className={styles.row2}>
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
                            </div>

                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={addrForm.is_default}
                                    onChange={(e) => onAddrChange({is_default: e.target.checked})}
                                />
                                Сделать адрес основным
                            </label>

                            <div className={styles.modalActions}>
                                <button className={styles.btnLight} onClick={closeAddressModal} type="button">
                                    Отмена
                                </button>
                                <button className={styles.btnDark} disabled={addrLoading} type="submit">
                                    {addrEditId ? 'Сохранить адрес' : 'Добавить адрес'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
