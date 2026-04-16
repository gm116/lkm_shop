import {useEffect, useMemo, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import styles from '../styles/CheckoutSuccessPage.module.css';

const PAYMENT_STATUS_LABELS = {
    pending: 'Ожидает подтверждения',
    waiting_for_capture: 'В обработке',
    succeeded: 'Оплачен',
    canceled: 'Отменен',
    failed: 'Ошибка оплаты',
};

function statusText(status) {
    return PAYMENT_STATUS_LABELS[status] || status || 'Статус уточняется';
}

export default function CheckoutSuccessPage() {
    const [searchParams] = useSearchParams();
    const {isAuthenticated, authFetch} = useAuth();

    const orderId = useMemo(() => {
        const raw = searchParams.get('order_id');
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');

    useEffect(() => {
        const sync = async () => {
            if (!orderId || !isAuthenticated) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError('');
            try {
                const res = await authFetch(`/api/payments/sync/${orderId}/`, {method: 'POST'});
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    throw new Error(data?.detail || 'Не удалось обновить статус оплаты');
                }
                setPaymentStatus(data?.status || '');
            } catch (e) {
                setError(e?.message || 'Не удалось обновить статус оплаты');
            } finally {
                setLoading(false);
            }
        };
        sync();
    }, [authFetch, isAuthenticated, orderId]);

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h1 className={styles.title}>Спасибо за заказ</h1>
                <p className={styles.sub}>
                    Мы получили информацию об оплате и обновляем статус заказа.
                </p>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Заказ</div>
                        <div className={styles.infoValue}>{orderId ? `#${orderId}` : 'Не определен'}</div>
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
