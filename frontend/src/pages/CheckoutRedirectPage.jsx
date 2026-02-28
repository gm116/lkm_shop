import {useEffect, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';

export default function CheckoutRedirectPage() {
    const navigate = useNavigate();
    const {state} = useLocation();
    const confirmationUrl = state?.confirmationUrl;
    const orderId = state?.orderId;

    const [seconds, setSeconds] = useState(10);

    useEffect(() => {
        if (!confirmationUrl) {
            navigate('/profile');
            return;
        }

        const t = setInterval(() => {
            setSeconds(s => s - 1);
        }, 1000);

        return () => clearInterval(t);
    }, [confirmationUrl, navigate]);

    useEffect(() => {
        if (seconds <= 0 && confirmationUrl) {
            window.location.href = confirmationUrl;
        }
    }, [seconds, confirmationUrl]);

    if (!confirmationUrl) return null;

    return (
        <div style={{
            maxWidth: 480,
            margin: '80px auto',
            padding: 24,
            fontFamily: 'system-ui',
            textAlign: 'center',
        }}>
            <h2>Переходим к оплате</h2>

            <p style={{opacity: 0.7}}>
                Сейчас откроется экран оплаты.<br/>
                Если этого не произошло, нажмите кнопку ниже.
            </p>

            <div style={{
                fontSize: 32,
                fontWeight: 700,
                margin: '16px 0',
            }}>
                {seconds}
            </div>

            <button
                onClick={() => window.location.href = confirmationUrl}
                style={{
                    padding: '12px 20px',
                    fontSize: 16,
                    fontWeight: 600,
                    borderRadius: 10,
                    border: 'none',
                    background: '#111827',
                    color: '#fff',
                    cursor: 'pointer',
                }}
            >
                Перейти к оплате
            </button>

            <div style={{marginTop: 16, fontSize: 14, opacity: 0.6}}>
                Заказ №{orderId}
            </div>
        </div>
    );
}