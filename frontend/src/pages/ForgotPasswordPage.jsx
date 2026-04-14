import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {requestPasswordReset} from '../api/auth';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/Auth.module.css';

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const notify = useNotify();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;

        const emailValue = email.trim();
        if (!emailValue) {
            notify.warning('Введите email');
            return;
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(emailValue)) {
            notify.warning('Введите корректный email');
            return;
        }

        setLoading(true);
        try {
            await requestPasswordReset({email: emailValue});
            setSubmitted(true);
            notify.success('Если email зарегистрирован, мы отправили ссылку для сброса');
        } catch (e) {
            notify.error(e?.message || 'Не удалось отправить письмо');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Забыли пароль</h2>
            <p className={styles.subtitle}>
                Введите email, который указан в аккаунте. Мы отправим ссылку для восстановления.
            </p>

            <div className={styles.card}>
                <form className={styles.form} onSubmit={onSubmit}>
                    <input
                        className={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        autoComplete="email"
                    />

                    <button className={styles.btn} type="submit" disabled={loading || !email.trim()}>
                        {loading ? 'Отправляем...' : 'Отправить ссылку'}
                    </button>

                    {submitted ? (
                        <div className={`${styles.statusBox} ${styles.statusSuccess}`}>
                            Проверьте почту и перейдите по ссылке из письма.
                        </div>
                    ) : null}

                    <div className={styles.row}>
                        <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                            Назад ко входу
                        </button>
                        <button type="button" className={styles.link} onClick={() => navigate('/catalog')}>
                            В каталог
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
