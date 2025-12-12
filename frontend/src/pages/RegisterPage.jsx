import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/authContext';
import styles from '../styles/Auth.module.css';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await register({
                username: username.trim(),
                email: email.trim(),
                password,
            });
            navigate('/profile');
        } catch (err) {
            setError(err.message || 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Регистрация</h2>

            <div className={styles.card}>
                {error && <div className={styles.error}>{error}</div>}

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
                    />
                    <input
                        className={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Пароль (минимум 8 символов)"
                        type="password"
                    />

                    <button className={styles.btn} disabled={loading || !username.trim() || password.length < 8}>
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