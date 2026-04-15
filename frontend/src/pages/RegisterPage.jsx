import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../store/authContext';
import styles from '../styles/Auth.module.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
    const navigate = useNavigate();
    const {requestRegisterCode, confirmRegisterCode} = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [code, setCode] = useState('');

    const [step, setStep] = useState('form');
    const [loading, setLoading] = useState(false);
    const [submittedForm, setSubmittedForm] = useState(false);
    const [submittedCode, setSubmittedCode] = useState(false);
    const [resendAt, setResendAt] = useState(0);
    const [nowTs, setNowTs] = useState(Date.now());

    const resendLeft = Math.max(0, Math.ceil((resendAt - nowTs) / 1000));

    useEffect(() => {
        if (step !== 'code' || resendLeft <= 0) return undefined;
        const timer = setInterval(() => {
            setNowTs(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, [step, resendLeft]);

    const formErrors = useMemo(() => {
        const next = {};

        const emailValue = email.trim();
        if (!emailValue) {
            next.email = 'Введите email';
        } else if (!emailPattern.test(emailValue)) {
            next.email = 'Введите корректный email';
        }

        if (!password) {
            next.password = 'Введите пароль';
        } else if (password.length < 8) {
            next.password = 'Минимум 8 символов';
        }

        if (!passwordConfirm) {
            next.passwordConfirm = 'Повторите пароль';
        } else if (password !== passwordConfirm) {
            next.passwordConfirm = 'Пароли не совпадают';
        }

        return next;
    }, [email, password, passwordConfirm]);

    const codeErrors = useMemo(() => {
        const next = {};
        const normalized = String(code || '').replace(/\D+/g, '');
        if (!normalized) {
            next.code = 'Введите код из письма';
        } else if (normalized.length !== 6) {
            next.code = 'Код должен содержать 6 цифр';
        }
        return next;
    }, [code]);

    const sendCode = async () => {
        setLoading(true);
        try {
            const response = await requestRegisterCode({
                email: email.trim(),
                password,
                password_confirm: passwordConfirm,
            });
            const retryAfter = Number(response?.retry_after || 60);
            setNowTs(Date.now());
            setResendAt(Date.now() + retryAfter * 1000);
            setStep('code');
            setSubmittedCode(false);
            return true;
        } catch (error) {
            return false;
        } finally {
            setLoading(false);
        }
    };

    const onSubmitForm = async (e) => {
        e.preventDefault();
        setSubmittedForm(true);

        if (Object.keys(formErrors).length > 0) {
            return;
        }

        await sendCode();
    };

    const onSubmitCode = async (e) => {
        e.preventDefault();
        setSubmittedCode(true);

        const normalizedCode = String(code || '').replace(/\D+/g, '');
        if (normalizedCode.length !== 6) {
            return;
        }

        setLoading(true);
        try {
            await confirmRegisterCode({
                email: email.trim(),
                code: normalizedCode,
            });
            navigate('/profile');
        } catch (error) {
            // Уведомление уже показывает authContext
        } finally {
            setLoading(false);
        }
    };

    const onResend = async () => {
        if (loading || resendLeft > 0) return;
        await sendCode();
    };

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <aside className={styles.aside}>
                    <h2 className={styles.asideTitle}>Новый аккаунт</h2>
                    <p className={styles.asideText}>
                        Для регистрации нужно подтвердить email кодом из письма. Это защищает аккаунт от ошибок и чужих регистраций.
                    </p>
                    <ul className={styles.asideList}>
                        <li className={styles.asideItem}>Код подтверждения действует ограниченное время</li>
                        <li className={styles.asideItem}>Без подтверждения email аккаунт не создается</li>
                        <li className={styles.asideItem}>После подтверждения вход выполняется автоматически</li>
                    </ul>
                </aside>

                <section className={styles.panel}>
                    <div className={styles.head}>
                        <h1 className={styles.title}>Регистрация</h1>
                        <p className={styles.subtitle}>
                            {step === 'form' ? 'Создайте пароль и подтвердите email кодом' : 'Введите код подтверждения из письма'}
                        </p>
                    </div>

                    {step === 'form' ? (
                        <form className={styles.form} onSubmit={onSubmitForm} noValidate>
                            <label className={styles.field}>
                                <span className={styles.label}>
                                    Email
                                    <span className={styles.labelRequired}>*</span>
                                </span>
                                <input
                                    className={`${styles.input} ${submittedForm && formErrors.email ? styles.inputInvalid : ''}`}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="example@mail.ru"
                                    type="email"
                                    autoComplete="email"
                                />
                                <span className={styles.fieldError}>{submittedForm ? formErrors.email || '' : ''}</span>
                            </label>

                            <div className={styles.columns}>
                                <label className={styles.field}>
                                    <span className={styles.label}>
                                        Пароль
                                        <span className={styles.labelRequired}>*</span>
                                    </span>
                                    <input
                                        className={`${styles.input} ${submittedForm && formErrors.password ? styles.inputInvalid : ''}`}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Минимум 8 символов"
                                        type="password"
                                        autoComplete="new-password"
                                    />
                                    <span className={styles.fieldError}>{submittedForm ? formErrors.password || '' : ''}</span>
                                </label>

                                <label className={styles.field}>
                                    <span className={styles.label}>
                                        Повторите пароль
                                        <span className={styles.labelRequired}>*</span>
                                    </span>
                                    <input
                                        className={`${styles.input} ${submittedForm && formErrors.passwordConfirm ? styles.inputInvalid : ''}`}
                                        value={passwordConfirm}
                                        onChange={(e) => setPasswordConfirm(e.target.value)}
                                        placeholder="Повторите пароль"
                                        type="password"
                                        autoComplete="new-password"
                                    />
                                    <span className={styles.fieldError}>{submittedForm ? formErrors.passwordConfirm || '' : ''}</span>
                                </label>
                            </div>

                            <button className={styles.btnPrimary} disabled={loading}>
                                {loading ? 'Отправляем код...' : 'Получить код подтверждения'}
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
                    ) : (
                        <form className={styles.form} onSubmit={onSubmitCode} noValidate>
                            <label className={styles.field}>
                                <span className={styles.label}>Email</span>
                                <input className={styles.input} value={email} readOnly />
                            </label>

                            <label className={styles.field}>
                                <span className={styles.label}>
                                    Код подтверждения
                                    <span className={styles.labelRequired}>*</span>
                                </span>
                                <input
                                    className={`${styles.input} ${submittedCode && codeErrors.code ? styles.inputInvalid : ''}`}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                                    placeholder="6 цифр"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                />
                                <span className={styles.fieldError}>{submittedCode ? codeErrors.code || '' : ''}</span>
                            </label>

                            <button className={styles.btnPrimary} disabled={loading}>
                                {loading ? 'Проверяем...' : 'Подтвердить email и завершить регистрацию'}
                            </button>

                            <div className={styles.linksRow}>
                                <button type="button" className={styles.link} onClick={onResend} disabled={loading || resendLeft > 0}>
                                    {resendLeft > 0 ? `Отправить код повторно через ${resendLeft} с` : 'Отправить код повторно'}
                                </button>
                                <button
                                    type="button"
                                    className={styles.linkMuted}
                                    onClick={() => {
                                        setStep('form');
                                        setSubmittedForm(false);
                                        setSubmittedCode(false);
                                        setCode('');
                                        setResendAt(0);
                                    }}
                                >
                                    Изменить email
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            </div>
        </div>
    );
}
