import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import styles from '../styles/Auth.module.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
    const navigate = useNavigate();
    const {register} = useAuth();

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const errors = useMemo(() => {
        const next = {};
        const usernameValue = username.trim();
        const emailValue = email.trim();

        if (!usernameValue) {
            next.username = 'Введите логин';
        } else if (usernameValue.length < 3) {
            next.username = 'Минимум 3 символа';
        }

        if (emailValue && !emailPattern.test(emailValue)) {
            next.email = 'Введите корректный email';
        }

        if (!password) {
            next.password = 'Введите пароль';
        } else if (password.length < 8) {
            next.password = 'Минимум 8 символов';
        }

        if (!passwordConfirm) {
            next.passwordConfirm = 'Повторите пароль';
        } else if (password && password !== passwordConfirm) {
            next.passwordConfirm = 'Пароли не совпадают';
        }

        return next;
    }, [username, email, password, passwordConfirm]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitted(true);

        if (Object.keys(errors).length > 0) {
            return;
        }

        setLoading(true);
        try {
            await register({
                username: username.trim(),
                email: email.trim(),
                password,
            });
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
                    <h2 className={styles.asideTitle}>Новый аккаунт</h2>
                    <p className={styles.asideText}>
                        Регистрация занимает минуту. После входа можно оформлять заказы без повторного ввода данных.
                    </p>
                    <ul className={styles.asideList}>
                        <li className={styles.asideItem}>Сохранение адресов и контактных данных</li>
                        <li className={styles.asideItem}>История заказов и повторное оформление</li>
                        <li className={styles.asideItem}>Контроль статусов и уведомлений</li>
                    </ul>
                </aside>

                <section className={styles.panel}>
                    <div className={styles.head}>
                        <h1 className={styles.title}>Регистрация</h1>
                        <p className={styles.subtitle}>Заполните обязательные поля для создания аккаунта</p>
                    </div>

                    <form className={styles.form} onSubmit={onSubmit} noValidate>
                        <label className={styles.field}>
                            <span className={styles.label}>
                                Логин
                                <span className={styles.labelRequired}>*</span>
                            </span>
                            <input
                                className={`${styles.input} ${submitted && errors.username ? styles.inputInvalid : ''}`}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Придумайте логин"
                                autoComplete="username"
                            />
                            <span className={styles.fieldError}>
                                {submitted ? errors.username || '' : ''}
                            </span>
                        </label>

                        <label className={styles.field}>
                            <span className={styles.label}>Email</span>
                            <input
                                className={`${styles.input} ${submitted && errors.email ? styles.inputInvalid : ''}`}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="example@mail.ru"
                                type="email"
                                autoComplete="email"
                            />
                            <span className={styles.fieldError}>
                                {submitted ? errors.email || '' : ''}
                            </span>
                        </label>

                        <div className={styles.columns}>
                            <label className={styles.field}>
                                <span className={styles.label}>
                                    Пароль
                                    <span className={styles.labelRequired}>*</span>
                                </span>
                                <input
                                    className={`${styles.input} ${submitted && errors.password ? styles.inputInvalid : ''}`}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Минимум 8 символов"
                                    type="password"
                                    autoComplete="new-password"
                                />
                                <span className={styles.fieldError}>
                                    {submitted ? errors.password || '' : ''}
                                </span>
                            </label>

                            <label className={styles.field}>
                                <span className={styles.label}>
                                    Повторите пароль
                                    <span className={styles.labelRequired}>*</span>
                                </span>
                                <input
                                    className={`${styles.input} ${submitted && errors.passwordConfirm ? styles.inputInvalid : ''}`}
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    placeholder="Повторите пароль"
                                    type="password"
                                    autoComplete="new-password"
                                />
                                <span className={styles.fieldError}>
                                    {submitted ? errors.passwordConfirm || '' : ''}
                                </span>
                            </label>
                        </div>

                        <button className={styles.btnPrimary} disabled={loading}>
                            {loading ? 'Создаём...' : 'Зарегистрироваться'}
                        </button>

                        <div className={styles.linksRow}>
                            <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                                Уже есть аккаунт
                            </button>
                            <button type="button" className={styles.linkMuted} onClick={() => navigate('/catalog')}>
                                В каталог
                            </button>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
}
