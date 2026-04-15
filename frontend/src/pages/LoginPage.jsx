import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import styles from '../styles/Auth.module.css';

export default function LoginPage() {
    const navigate = useNavigate();
    const {login} = useAuth();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const errors = useMemo(() => {
        const next = {};

        if (!identifier.trim()) {
            next.identifier = 'Введите email или логин';
        }
        if (!password) {
            next.password = 'Введите пароль';
        }

        return next;
    }, [identifier, password]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitted(true);

        if (Object.keys(errors).length > 0) {
            return;
        }

        setLoading(true);
        try {
            await login({username: identifier.trim(), password});
            navigate('/profile');
        } catch (err) {
            // Уведомление уже показывает authContext
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <aside className={styles.aside}>
                    <h2 className={styles.asideTitle}>Личный кабинет</h2>
                    <p className={styles.asideText}>
                        Быстрый вход к заказам, адресам и статусам доставки в одном месте.
                    </p>
                    <ul className={styles.asideList}>
                        <li className={styles.asideItem}>Отслеживание заказов в реальном времени</li>
                        <li className={styles.asideItem}>Быстрое повторное оформление из истории</li>
                        <li className={styles.asideItem}>Доступ к оплате и документам по заказу</li>
                    </ul>
                </aside>

                <section className={styles.panel}>
                    <div className={styles.head}>
                        <h1 className={styles.title}>Вход</h1>
                        <p className={styles.subtitle}>Основной вход по email, также можно войти по логину</p>
                    </div>

                    <form className={styles.form} onSubmit={onSubmit} noValidate>
                        <label className={styles.field}>
                            <span className={styles.label}>
                                Email или логин
                                <span className={styles.labelRequired}>*</span>
                            </span>
                            <input
                                className={`${styles.input} ${submitted && errors.identifier ? styles.inputInvalid : ''}`}
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                placeholder="example@mail.ru или логин"
                                autoComplete="username"
                            />
                            <span className={styles.fieldError}>
                                {submitted ? errors.identifier || '' : ''}
                            </span>
                        </label>

                        <label className={styles.field}>
                            <span className={styles.label}>
                                Пароль
                                <span className={styles.labelRequired}>*</span>
                            </span>
                            <input
                                className={`${styles.input} ${submitted && errors.password ? styles.inputInvalid : ''}`}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Введите пароль"
                                type="password"
                                autoComplete="current-password"
                            />
                            <span className={styles.fieldError}>
                                {submitted ? errors.password || '' : ''}
                            </span>
                        </label>

                        <button className={styles.btnPrimary} disabled={loading}>
                            {loading ? 'Входим...' : 'Войти'}
                        </button>

                        <div className={styles.linksRow}>
                            <button
                                type="button"
                                className={styles.link}
                                onClick={() => navigate('/forgot-password')}
                            >
                                Забыли пароль?
                            </button>
                            <button
                                type="button"
                                className={styles.link}
                                onClick={() => navigate('/register')}
                            >
                                Регистрация
                            </button>
                            <button
                                type="button"
                                className={styles.linkMuted}
                                onClick={() => navigate('/catalog')}
                            >
                                В каталог
                            </button>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
}
