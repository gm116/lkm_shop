import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {FaBoxOpen, FaCity, FaMapMarkerAlt, FaStore, FaTruck} from 'react-icons/fa';

import {useCart} from '../store/cartContext';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';

import styles from '../styles/CheckoutPage.module.css';

const DELIVERY_TYPES = {
    STORE_PICKUP: 'store_pickup',
    PVZ: 'pvz',
};

const DELIVERY_SERVICES = [
    {value: 'ozon', label: 'Озон доставка'},
    {value: 'kit', label: 'КИТ'},
    {value: 'delovie_linii', label: 'Деловые линии'},
    {value: 'cdek', label: 'СДЭК'},
];

const DELIVERY_SERVICE_LABELS = DELIVERY_SERVICES.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
}, {});

const STORE_PICKUP_POINT = {
    id: 'store_default',
    name: 'Самовывоз',
    address: 'Набережные Челны, точка выдачи магазина',
};

function buildFullName(prefill) {
    const first = (prefill?.first_name || '').trim();
    const last = (prefill?.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    return full || (prefill?.username || '');
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

function emailIsValid(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function buildFieldErrors({customerName, customerPhone, customerEmail, deliveryType, deliveryService, pvzCity}) {
    const errors = {};

    if (!String(customerName || '').trim()) {
        errors.customerName = 'Укажите имя получателя';
    }

    if (!String(customerPhone || '').trim()) {
        errors.customerPhone = 'Укажите телефон';
    } else if (!phoneIsValid(customerPhone)) {
        errors.customerPhone = 'Неверный формат телефона';
    }

    if (!emailIsValid(customerEmail)) {
        errors.customerEmail = 'Введите корректный email';
    }

    if (deliveryType === DELIVERY_TYPES.PVZ) {
        if (!String(deliveryService || '').trim()) {
            errors.deliveryService = 'Выберите службу доставки';
        }
        if (!String(pvzCity || '').trim()) {
            errors.pvzCity = 'Укажите город для доставки до ПВЗ';
        }
    }

    return errors;
}

function CheckoutFormSkeleton() {
    return (
        <div className={styles.formSkeleton} aria-hidden="true">
            <div className={styles.skBlock}>
                <div className={styles.skTitle}/>
                <div className={styles.skInput}/>
                <div className={styles.skRow}>
                    <div className={styles.skInput}/>
                    <div className={styles.skInput}/>
                </div>
            </div>

            <div className={styles.skBlock}>
                <div className={styles.skTitle}/>
                <div className={styles.skDeliveryRow}>
                    <div className={styles.skDeliveryCard}/>
                    <div className={styles.skDeliveryCard}/>
                </div>
                <div className={styles.skInput}/>
                <div className={styles.skInput}/>
            </div>

            <div className={styles.skBlock}>
                <div className={styles.skTitle}/>
                <div className={styles.skTextarea}/>
            </div>

            <div className={styles.skButton}/>
        </div>
    );
}

function CheckoutSummarySkeleton() {
    return (
        <div className={styles.summarySkeleton} aria-hidden="true">
            <div className={styles.skTitle}/>
            {[0, 1, 2].map((item) => (
                <div className={styles.skItemRow} key={`checkout-sk-${item}`}>
                    <div className={styles.skImage}/>
                    <div className={styles.skItemMeta}>
                        <div className={styles.skLine}/>
                        <div className={styles.skLineShort}/>
                    </div>
                </div>
            ))}
            <div className={styles.skTotalRow}/>
        </div>
    );
}

export default function CheckoutPage() {
    const navigate = useNavigate();
    const notify = useNotify();

    const {cart, clearCart, loading: cartLoading} = useCart();
    const {accessToken, isAuthenticated, authFetch, logout} = useAuth();

    const [loading, setLoading] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [error, setError] = useState('');

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');

    const [checkoutInProgress, setCheckoutInProgress] = useState(false);
    const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPES.STORE_PICKUP);
    const [deliveryService, setDeliveryService] = useState(DELIVERY_SERVICES[0].value);
    const [pvzCity, setPvzCity] = useState('');

    const [comment, setComment] = useState('');
    const [submitAttempted, setSubmitAttempted] = useState(false);

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    const itemsTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.count || 0), 0);
    }, [cart]);

    const itemsCount = useMemo(() => {
        return cart.reduce((sum, item) => sum + Number(item.count || 0), 0);
    }, [cart]);

    const fieldErrors = useMemo(() => buildFieldErrors({
        customerName,
        customerPhone,
        customerEmail,
        deliveryType,
        deliveryService,
        pvzCity,
    }), [customerName, customerPhone, customerEmail, deliveryType, deliveryService, pvzCity]);

    const canSubmit = useMemo(() => {
        if (!isAuthenticated || !accessToken) return false;
        if (cartLoading) return false;
        if (cart.length === 0) return false;
        if (initLoading) return false;
        return Object.keys(fieldErrors).length === 0;
    }, [isAuthenticated, accessToken, cartLoading, cart.length, initLoading, fieldErrors]);

    useEffect(() => {
        if (!isAuthenticated || !accessToken) {
            setInitLoading(false);
            return;
        }

        (async () => {
            setInitLoading(true);
            setError('');

            try {
                const prefillRes = await authFetch('/api/users/me/prefill/', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (prefillRes.status === 401) {
                    await logout();
                    return;
                }

                const prefillJson = await prefillRes.json().catch(() => null);

                if (!prefillRes.ok) {
                    throw new Error(prefillJson?.detail || 'Не удалось загрузить данные профиля');
                }

                const name = buildFullName(prefillJson);
                const email = (prefillJson?.email || '').trim();
                const phone = (prefillJson?.default_address?.phone || '').trim();
                const city = (prefillJson?.default_address?.city || '').trim();

                setCustomerName((prev) => (prev ? prev : name));
                setCustomerEmail((prev) => (prev ? prev : email));
                setCustomerPhone((prev) => (prev ? prev : normalizePhone(phone)));
                setPvzCity((prev) => (prev ? prev : city));
            } catch (e) {
                setError(e?.message || 'Ошибка инициализации');
            } finally {
                setInitLoading(false);
            }
        })();
    }, [isAuthenticated, accessToken, authFetch, logout]);

    const handleDeliveryTypeChange = (type) => {
        setDeliveryType(type);
        setError('');
    };

    const submitOrder = async (e) => {
        e.preventDefault();
        setSubmitAttempted(true);
        setError('');

        if (!canSubmit) {
            const firstError = fieldErrors.customerName
                || fieldErrors.customerPhone
                || fieldErrors.customerEmail
                || fieldErrors.deliveryService
                || fieldErrors.pvzCity
                || 'Проверь обязательные поля';
            setError(firstError);
            notify.warning(firstError);
            return;
        }

        const serviceLabel = DELIVERY_SERVICE_LABELS[deliveryService] || deliveryService;

        const payload = {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim(),
            delivery_type: deliveryType,
            delivery_service: deliveryType === DELIVERY_TYPES.PVZ ? deliveryService : '',
            delivery_city: deliveryType === DELIVERY_TYPES.PVZ ? pvzCity.trim() : '',
            delivery_address_text: deliveryType === DELIVERY_TYPES.PVZ
                ? `Доставка до ПВЗ (${serviceLabel}), город ${pvzCity.trim()}. Точку выдачи уточняет менеджер.`
                : '',
            pickup_point_data: deliveryType === DELIVERY_TYPES.STORE_PICKUP
                ? STORE_PICKUP_POINT
                : {
                    id: `${deliveryService}_pending`,
                    name: `ПВЗ (${serviceLabel})`,
                    address: `${pvzCity.trim()}, точка выдачи уточняется менеджером`,
                },
            comment: comment.trim(),
        };

        setLoading(true);
        setCheckoutInProgress(true);

        try {
            const resOrder = await authFetch('/api/orders/create-from-cart/', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });

            if (resOrder.status === 401) {
                await logout();
                setCheckoutInProgress(false);
                return;
            }

            const orderData = await resOrder.json().catch(() => null);
            if (!resOrder.ok) throw new Error(orderData?.detail || 'Ошибка оформления заказа');

            const orderId = orderData?.order_id;
            if (!orderId) throw new Error('Не пришел order_id');

            const resPay = await authFetch('/api/payments/create/', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({order_id: orderId}),
            });

            const payData = await resPay.json().catch(() => null);
            if (!resPay.ok) throw new Error(payData?.detail || 'Ошибка создания платежа');

            const confirmationUrl = payData?.confirmation_url;
            if (!confirmationUrl) throw new Error('Не пришла ссылка на оплату');

            await clearCart();
            notify.success('Заказ создан, перенаправляю на оплату');

            navigate('/checkout/redirect', {
                replace: true,
                state: {orderId, confirmationUrl},
            });
        } catch (err) {
            setError(err?.message || 'Ошибка');
            setCheckoutInProgress(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        if (checkoutInProgress || loading || cartLoading || initLoading) return;
        if (cart.length === 0) {
            navigate('/profile', {replace: true});
        }
    }, [cart.length, checkoutInProgress, loading, cartLoading, initLoading, isAuthenticated, navigate]);

    if (!isAuthenticated) {
        return (
            <div className={styles.page}>
                <div className={styles.head}>
                    <h1 className={styles.title}>Оформление заказа</h1>
                    <p className={styles.subtitle}>
                        Для завершения покупки войдите в аккаунт или зарегистрируйтесь.
                    </p>
                </div>
                <section className={`${styles.card} ${styles.unauthCard}`}>
                    <div className={styles.unauthIcon}><FaStore/></div>
                    <h2 className={styles.unauthTitle}>Войдите, чтобы продолжить оформление</h2>
                    <p className={styles.unauthText}>
                        После входа вы сможете сохранить контактные данные, выбрать способ получения и перейти к оплате.
                    </p>
                    <div className={styles.unauthActions}>
                        <button
                            type="button"
                            className={styles.submitBtn}
                            onClick={() => navigate('/login', {state: {from: '/checkout'}})}
                        >
                            Войти
                        </button>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() => navigate('/register', {state: {from: '/checkout'}})}
                        >
                            Регистрация
                        </button>
                    </div>
                    <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => navigate('/catalog')}
                    >
                        Вернуться в каталог
                    </button>
                </section>
            </div>
        );
    }

    if (!cartLoading && cart.length === 0) {
        return (
            <div className={styles.page}>
                <h1 className={styles.title}>Оформление заказа</h1>
                <div className={styles.card}>Корзина пуста.</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.head}>
                <h1 className={styles.title}>Оформление заказа</h1>
                <p className={styles.subtitle}>
                    Проверь контактные данные и выбери способ получения заказа.
                </p>
            </div>

            <div className={styles.layout}>
                <section className={`${styles.card} ${styles.formCard}`}>
                    {initLoading ? (
                        <CheckoutFormSkeleton/>
                    ) : (
                        <form className={styles.form} onSubmit={submitOrder} noValidate>
                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Контактные данные</div>

                                <div className={styles.row3}>
                                    <div className={styles.fieldBlock}>
                                        <label className={styles.label}>
                                            Получатель <span className={styles.reqStar}>*</span>
                                        </label>
                                        <input
                                            className={`${styles.input} ${submitAttempted && fieldErrors.customerName ? styles.inputError : ''}`}
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            placeholder="ФИО"
                                        />
                                        <div className={styles.fieldNote}>
                                            {submitAttempted && fieldErrors.customerName ? fieldErrors.customerName : ''}
                                        </div>
                                    </div>

                                    <div className={styles.fieldBlock}>
                                        <label className={styles.label}>
                                            Телефон <span className={styles.reqStar}>*</span>
                                        </label>
                                        <input
                                            className={`${styles.input} ${submitAttempted && fieldErrors.customerPhone ? styles.inputError : ''}`}
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(normalizePhone(e.target.value))}
                                            placeholder="+7 (___) ___-__-__"
                                            inputMode="tel"
                                        />
                                        <div className={styles.fieldNote}>
                                            {submitAttempted && fieldErrors.customerPhone ? fieldErrors.customerPhone : ''}
                                        </div>
                                    </div>

                                    <div className={styles.fieldBlock}>
                                        <label className={styles.label}>Email</label>
                                        <input
                                            className={`${styles.input} ${submitAttempted && fieldErrors.customerEmail ? styles.inputError : ''}`}
                                            value={customerEmail}
                                            onChange={(e) => setCustomerEmail(e.target.value)}
                                            placeholder="example@mail.ru"
                                            inputMode="email"
                                        />
                                        <div className={styles.fieldNote}>
                                            {submitAttempted && fieldErrors.customerEmail ? fieldErrors.customerEmail : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Способ получения</div>

                                <div className={styles.deliverySwitch}>
                                    <button
                                        type="button"
                                        className={`${styles.deliveryOption} ${deliveryType === DELIVERY_TYPES.STORE_PICKUP ? styles.deliveryOptionActive : ''}`}
                                        onClick={() => handleDeliveryTypeChange(DELIVERY_TYPES.STORE_PICKUP)}
                                    >
                                        <span className={styles.deliveryIcon}><FaStore/></span>
                                        <span>
                                            <span className={styles.deliveryTitle}>Самовывоз</span>
                                            <span className={styles.deliveryHint}>Заберете заказ в магазине</span>
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        className={`${styles.deliveryOption} ${deliveryType === DELIVERY_TYPES.PVZ ? styles.deliveryOptionActive : ''}`}
                                        onClick={() => handleDeliveryTypeChange(DELIVERY_TYPES.PVZ)}
                                    >
                                        <span className={styles.deliveryIcon}><FaTruck/></span>
                                        <span>
                                            <span className={styles.deliveryTitle}>Доставка до ПВЗ</span>
                                            <span className={styles.deliveryHint}>Точку выдачи уточним после заказа</span>
                                        </span>
                                    </button>
                                </div>

                                {deliveryType === DELIVERY_TYPES.STORE_PICKUP ? (
                                    <div className={styles.pickupNote}>
                                        <div className={styles.pickupLine}><FaMapMarkerAlt/> Набережные Челны, точка выдачи магазина</div>
                                        <div className={styles.pickupLine}><FaBoxOpen/> Подготовим заказ после подтверждения оплаты</div>
                                    </div>
                                ) : (
                                    <div className={styles.row2}>
                                        <div className={styles.fieldBlock}>
                                            <label className={styles.label}>
                                                Служба доставки <span className={styles.reqStar}>*</span>
                                            </label>
                                            <select
                                                className={`${styles.select} ${submitAttempted && fieldErrors.deliveryService ? styles.inputError : ''}`}
                                                value={deliveryService}
                                                onChange={(e) => setDeliveryService(e.target.value)}
                                            >
                                                {DELIVERY_SERVICES.map((service) => (
                                                    <option key={service.value} value={service.value}>
                                                        {service.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className={styles.fieldNote}>
                                                {submitAttempted && fieldErrors.deliveryService ? fieldErrors.deliveryService : ''}
                                            </div>
                                        </div>

                                        <div className={styles.fieldBlock}>
                                            <label className={styles.label}>
                                                Город <span className={styles.reqStar}>*</span>
                                            </label>
                                            <div className={styles.inputWithIcon}>
                                                <FaCity className={styles.inputIcon}/>
                                                <input
                                                    className={`${styles.input} ${submitAttempted && fieldErrors.pvzCity ? styles.inputError : ''}`}
                                                    value={pvzCity}
                                                    onChange={(e) => setPvzCity(e.target.value)}
                                                    placeholder="Например, Казань"
                                                />
                                            </div>
                                            <div className={styles.fieldNote}>
                                                {submitAttempted && fieldErrors.pvzCity ? fieldErrors.pvzCity : ''}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Комментарий к заказу</div>
                                <textarea
                                    className={styles.textarea}
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Например: звонить после 18:00"
                                />
                            </div>

                            {error ? <div className={styles.error}>{error}</div> : null}

                            <button className={styles.submitBtn} type="submit" disabled={loading || !canSubmit}>
                                {loading ? 'Оформляем заказ...' : 'Перейти к оплате'}
                            </button>
                        </form>
                    )}
                </section>

                <aside className={`${styles.card} ${styles.summaryCard}`}>
                    {cartLoading ? (
                        <CheckoutSummarySkeleton/>
                    ) : (
                        <>
                            <div className={styles.summaryHead}>
                                <div className={styles.sectionTitle}>Ваш заказ</div>
                                <div className={styles.summaryCount}>{itemsCount} шт.</div>
                            </div>

                            <div className={styles.itemsList}>
                                {cart.map((item) => {
                                    const itemTotal = Number(item.price || 0) * Number(item.count || 0);
                                    return (
                                        <div className={styles.itemCard} key={item.id}>
                                            <div className={styles.itemImageWrap}>
                                                {item.image_url ? (
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.name}
                                                        className={styles.itemImage}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className={styles.itemImagePlaceholder}>Фото</div>
                                                )}
                                            </div>
                                            <div className={styles.itemInfo}>
                                                <div className={styles.itemName}>{item.name}</div>
                                                <div className={styles.itemMeta}>
                                                    {item.count} x {Number(item.price || 0).toLocaleString('ru-RU')} ₽
                                                </div>
                                            </div>
                                            <div className={styles.itemTotal}>{itemTotal.toLocaleString('ru-RU')} ₽</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className={styles.summaryTotals}>
                                <div className={styles.totalRow}>
                                    <span>Товары</span>
                                    <span>{itemsTotal.toLocaleString('ru-RU')} ₽</span>
                                </div>
                                <div className={styles.totalRow}>
                                    <span>Доставка</span>
                                    <span>{deliveryType === DELIVERY_TYPES.STORE_PICKUP ? '0 ₽' : 'По тарифу перевозчика'}</span>
                                </div>
                                <div className={`${styles.totalRow} ${styles.totalFinal}`}>
                                    <span>К оплате</span>
                                    <span>{itemsTotal.toLocaleString('ru-RU')} ₽</span>
                                </div>
                            </div>

                            {deliveryType === DELIVERY_TYPES.PVZ ? (
                                <div className={styles.summaryHint}>
                                    Менеджер свяжется с вами и уточнит конкретный пункт выдачи.
                                </div>
                            ) : null}
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}
