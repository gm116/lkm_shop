import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {confirmPasswordReset, validatePasswordReset} from '../api/auth';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/Auth.module.css';

function normalizeResetError(rawMessage) {
    const message = String(rawMessage || '').trim();
    const lower = message.toLowerCase();

    if (lower.includes('устарела') || lower.includes('недействительна')) {
        return 'Ссылка недействительна или устарела';
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
    const [submitted, setSubmitted] = useState(false);

    const [linkChecking, setLinkChecking] = useState(true);
    const [linkValid, setLinkValid] = useState(false);
    const [linkError, setLinkError] = useState('');

    const errors = useMemo(() => {
        const next = {};

        if (!password) {
            next.password = 'Введите новый пароль';
        } else if (password.length < 8) {
            next.password = 'Минимум 8 символов';
        }

        if (!passwordConfirm) {
            next.passwordConfirm = 'Повторите пароль';
        } else if (password && password !== passwordConfirm) {
            next.passwordConfirm = 'Пароли не совпадают';
        }

        return next;
    }, [password, passwordConfirm]);

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
            } catch (error) {
                if (!cancelled) {
                    const message = normalizeResetError(error?.message);
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
        if (loading || linkChecking || !linkValid) return;

        setSubmitted(true);
        if (Object.keys(errors).length > 0) {
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
        } catch (error) {
            notify.error(normalizeResetError(error?.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.shellSingle}>
                <section className={styles.panel}>
                    <div className={styles.head}>
                        <h1 className={styles.title}>Новый пароль</h1>
                        <p className={styles.subtitle}>Укажите новый пароль для входа в аккаунт.</p>
                    </div>

                    {linkChecking ? <div className={styles.statusBox}>Проверяем ссылку...</div> : null}

                    {!linkChecking && !linkValid ? (
                        <>
                            <div className={`${styles.statusBox} ${styles.statusError}`}>
                                {linkError || 'Ссылка недействительна или устарела'}
                            </div>
                            <div className={styles.linksRow}>
                                <button type="button" className={styles.link} onClick={() => navigate('/forgot-password')}>
                                    Запросить новую ссылку
                                </button>
                                <button type="button" className={styles.linkMuted} onClick={() => navigate('/login')}>
                                    Ко входу
                                </button>
                            </div>
                        </>
                    ) : null}

                    {linkValid ? (
                        <form className={styles.form} onSubmit={onSubmit} noValidate>
                            <p className={styles.helperText}>Минимум 8 символов. Не используйте очевидные комбинации.</p>

                            <div className={styles.columns}>
                                <label className={styles.field}>
                                    <span className={styles.label}>
                                        Новый пароль
                                        <span className={styles.labelRequired}>*</span>
                                    </span>
                                    <input
                                        className={`${styles.input} ${submitted && errors.password ? styles.inputInvalid : ''}`}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Минимум 8 символов"
                                        type="password"
                                        autoComplete="new-password"
                                        disabled={loading}
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
                                        disabled={loading}
                                    />
                                    <span className={styles.fieldError}>
                                        {submitted ? errors.passwordConfirm || '' : ''}
                                    </span>
                                </label>
                            </div>

                            <button className={styles.btnPrimary} type="submit" disabled={loading}>
                                {loading ? 'Сохраняем...' : 'Сохранить пароль'}
                            </button>

                            <div className={styles.linksRow}>
                                <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                                    Ко входу
                                </button>
                                <button type="button" className={styles.linkMuted} onClick={() => navigate('/catalog')}>
                                    В каталог
                                </button>
                            </div>
                        </form>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
