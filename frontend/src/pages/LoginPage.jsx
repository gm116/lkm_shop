import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/authContext';
import styles from '../styles/Auth.module.css';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [loading, setLoading] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await login({ username: username.trim(), password });
            navigate('/profile');
        } catch (err) {
            // Уведомление уже показывает authContext
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Вход</h2>

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
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Пароль"
                        type="password"
                    />

                    <button className={styles.btn} disabled={loading || !username.trim() || !password}>
                        {loading ? 'Входим...' : 'Войти'}
                    </button>

                    <div className={styles.row}>
                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => navigate('/register')}
                        >
                            Регистрация
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
