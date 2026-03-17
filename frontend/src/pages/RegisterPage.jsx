import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/authContext';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/Auth.module.css';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const notify = useNotify();

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    const [loading, setLoading] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const usernameValue = username.trim();
            const emailValue = email.trim();

            if (!usernameValue) {
                notify.warning('Введите логин');
                return;
            }

            if (emailValue) {
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailPattern.test(emailValue)) {
                    notify.warning('Введите корректный email');
                    return;
                }
            }

            if (password.length < 8) {
                notify.warning('Пароль должен быть не короче 8 символов');
                return;
            }

            if (password !== passwordConfirm) {
                notify.warning('Пароли не совпадают');
                return;
            }

            await register({
                username: usernameValue,
                email: emailValue,
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
        <div className={styles.container}>
            <h2 className={styles.title}>Регистрация</h2>

            <div className={styles.card}>
                <form className={styles.form} onSubmit={onSubmit}>
                    <input
                        className={styles.input}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Логин"
                    />
                    <input
                        className={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email (необязательно)"
                        type="email"
                        autoComplete="email"
                    />
                    <input
                        className={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Пароль (минимум 8 символов)"
                        type="password"
                        autoComplete="new-password"
                    />
                    <input
                        className={styles.input}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="Повторите пароль"
                        type="password"
                        autoComplete="new-password"
                    />

                    <button
                        className={styles.btn}
                        disabled={loading || !username.trim() || password.length < 8 || !passwordConfirm}
                    >
                        {loading ? 'Создаём...' : 'Зарегистрироваться'}
                    </button>

                    <div className={styles.row}>
                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => navigate('/login')}
                        >
                            Уже есть аккаунт
                        </button>

                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => navigate('/catalog')}
                        >
                            В каталог
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
