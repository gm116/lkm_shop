import {useEffect, useMemo, useState} from 'react';
import {Link, Navigate, useSearchParams} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import styles from '../styles/CheckoutSuccessPage.module.css';

const PAYMENT_STATUS_LABELS = {
    pending: 'Ожидает подтверждения',
    waiting_for_capture: 'В обработке',
    succeeded: 'Оплачен',
    canceled: 'Отменен',
    failed: 'Ошибка оплаты',
};

function normalizeOrderId(raw) {
    const value = String(raw || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value
        : '';
}

function statusText(status) {
    return PAYMENT_STATUS_LABELS[status] || status || 'Статус уточняется';
}

export default function CheckoutSuccessPage() {
    const [searchParams] = useSearchParams();
    const {isAuthenticated, authFetch, loading: authLoading} = useAuth();

    const orderId = useMemo(() => {
        return normalizeOrderId(searchParams.get('order_id'));
    }, [searchParams]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [accessDenied, setAccessDenied] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState('');
    const [displayOrderId, setDisplayOrderId] = useState('');

    useEffect(() => {
        const sync = async () => {
            if (authLoading) {
                return;
            }
            if (!orderId || !isAuthenticated) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError('');
            setAccessDenied(false);
            setNotFound(false);
            try {
                const res = await authFetch(`/api/payments/sync/${orderId}/`, {method: 'POST'});
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    if (res.status === 403) {
                        setAccessDenied(true);
                        return;
                    }
                    if (res.status === 404) {
                        setNotFound(true);
                        return;
                    }
                    throw new Error(data?.detail || 'Не удалось обновить статус оплаты');
                }
                setPaymentStatus(data?.status || '');
                setDisplayOrderId(data?.display_id || '');
            } catch (e) {
                setError(e?.message || 'Не удалось обновить статус оплаты');
            } finally {
                setLoading(false);
            }
        };
        sync();
    }, [authFetch, authLoading, isAuthenticated, orderId]);

    if (!authLoading && !isAuthenticated) {
        return <Navigate to="/login" replace/>;
    }

    if (!orderId) {
        return (
            <div className={styles.page}>
                <div className={styles.card}>
                    <h1 className={styles.title}>Заказ не найден</h1>
                    <p className={styles.sub}>
                        В ссылке нет корректного номера заказа. Проверьте историю заказов в личном кабинете.
                    </p>
                    <div className={styles.actions}>
                        <Link className={styles.btnPrimary} to="/profile">Перейти в личный кабинет</Link>
                        <Link className={styles.btnLight} to="/catalog">Вернуться в каталог</Link>
                    </div>
                </div>
            </div>
        );
    }

    if (accessDenied || notFound) {
        return (
            <div className={styles.page}>
                <div className={styles.card}>
                    <h1 className={styles.title}>Заказ недоступен</h1>
                    <p className={styles.sub}>
                        Мы не можем показать информацию по этому заказу в текущем аккаунте.
                    </p>
                    <div className={styles.notes}>
                        <p>Войдите в аккаунт, с которого был оформлен заказ, или откройте его в личном кабинете.</p>
                    </div>
                    <div className={styles.actions}>
                        <Link className={styles.btnPrimary} to="/profile">Перейти в личный кабинет</Link>
                        <Link className={styles.btnLight} to="/catalog">Вернуться в каталог</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h1 className={styles.title}>
                    {loading ? 'Проверяем оплату' : 'Спасибо за заказ'}
                </h1>
                <p className={styles.sub}>
                    {loading
                        ? 'Проверяем статус платежа и обновляем заказ.'
                        : 'Мы получили информацию об оплате и обновили статус заказа.'}
                </p>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Заказ</div>
                        <div className={styles.infoValue}>{displayOrderId ? `#${displayOrderId}` : 'Проверяем...'}</div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Статус оплаты</div>
                        <div className={styles.infoValue}>
                            {loading ? 'Проверяем...' : statusText(paymentStatus)}
                        </div>
                    </div>
                </div>

                {error ? <div className={styles.error}>{error}</div> : null}

                <div className={styles.notes}>
                    <p>Если статус еще не обновился, откройте заказ в личном кабинете через 1-2 минуты.</p>
                    <p>Уведомление о дальнейшем изменении статуса заказа придет на email.</p>
                </div>

                <div className={styles.actions}>
                    <Link className={styles.btnPrimary} to="/profile">Перейти в личный кабинет</Link>
                    <Link className={styles.btnLight} to="/catalog">Вернуться в каталог</Link>
                </div>
            </div>
        </div>
    );
}
