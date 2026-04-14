import {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {confirmPasswordReset, validatePasswordReset} from '../api/auth';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/Auth.module.css';

function normalizeResetError(rawMessage) {
    const message = String(rawMessage || '').trim();
    const lower = message.toLowerCase();

    if (lower.includes('устарела') || lower.includes('недействительна')) {
        return 'Ссылка недействительна или уже устарела';
    }
    if (lower.includes('пароли не совпадают')) {
        return 'Пароли не совпадают';
    }
    if (lower.includes('new_password:')) {
        return message.replace(/^new_password:\s*/i, '');
    }
    if (lower.includes('new_password_confirm:')) {
        return message.replace(/^new_password_confirm:\s*/i, '');
    }
    return message || 'Не удалось обновить пароль';
}

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const notify = useNotify();
    const {uid, token} = useParams();

    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [linkChecking, setLinkChecking] = useState(true);
    const [linkValid, setLinkValid] = useState(false);
    const [linkError, setLinkError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const checkLink = async () => {
            setLinkChecking(true);
            setLinkValid(false);
            setLinkError('');

            if (!uid || !token) {
                if (!cancelled) {
                    setLinkError('Ссылка недействительна или неполная');
                    setLinkChecking(false);
                }
                return;
            }

            try {
                await validatePasswordReset({uid, token});
                if (!cancelled) {
                    setLinkValid(true);
                }
            } catch (e) {
                if (!cancelled) {
                    const message = normalizeResetError(e?.message);
                    setLinkError(message);
                    notify.error(message);
                }
            } finally {
                if (!cancelled) {
                    setLinkChecking(false);
                }
            }
        };

        checkLink();

        return () => {
            cancelled = true;
        };
    }, [uid, token, notify]);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;

        if (linkChecking) {
            notify.info('Проверяем ссылку...');
            return;
        }

        if (!linkValid) {
            notify.error(linkError || 'Ссылка недействительна или уже устарела');
            return;
        }

        if (password.length < 8) {
            notify.warning('Пароль должен быть не короче 8 символов');
            return;
        }

        if (password !== passwordConfirm) {
            notify.warning('Пароли не совпадают');
            return;
        }

        setLoading(true);
        try {
            await confirmPasswordReset({
                uid,
                token,
                new_password: password,
                new_password_confirm: passwordConfirm,
            });
            notify.success('Пароль обновлён. Теперь можно войти');
            navigate('/login', {replace: true});
        } catch (e) {
            notify.error(normalizeResetError(e?.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Новый пароль</h2>
            <p className={styles.subtitle}>
                Придумайте новый пароль для входа в аккаунт.
            </p>

            <div className={styles.card}>
                {linkChecking ? (
                    <div className={styles.statusBox}>Проверяем ссылку...</div>
                ) : null}
                {!linkChecking && !linkValid ? (
                    <>
                        <div className={`${styles.statusBox} ${styles.statusError}`}>
                            {linkError || 'Ссылка недействительна или уже устарела'}
                        </div>
                        <div className={styles.row}>
                            <button type="button" className={styles.link} onClick={() => navigate('/forgot-password')}>
                                Запросить новую ссылку
                            </button>
                            <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                                Ко входу
                            </button>
                        </div>
                    </>
                ) : null}

                {linkValid ? (
                    <form className={styles.form} onSubmit={onSubmit}>
                        <div className={styles.helperText}>
                            Минимум 8 символов. Не используйте простой или очевидный пароль.
                        </div>
                        <input
                            className={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Новый пароль (минимум 8 символов)"
                            type="password"
                            autoComplete="new-password"
                            disabled={loading}
                        />
                        <input
                            className={styles.input}
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                            placeholder="Повторите новый пароль"
                            type="password"
                            autoComplete="new-password"
                            disabled={loading}
                        />

                        <button
                            className={styles.btn}
                            type="submit"
                            disabled={loading || !password || !passwordConfirm}
                        >
                            {loading ? 'Сохраняем...' : 'Сохранить пароль'}
                        </button>

                        <div className={styles.row}>
                            <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                                Ко входу
                            </button>
                            <button type="button" className={styles.link} onClick={() => navigate('/catalog')}>
                                В каталог
                            </button>
                        </div>
                    </form>
                ) : null}
            </div>
        </div>
    );
}
