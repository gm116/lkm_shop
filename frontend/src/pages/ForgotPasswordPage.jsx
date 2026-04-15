import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {requestPasswordReset} from '../api/auth';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/Auth.module.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const notify = useNotify();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [requestSent, setRequestSent] = useState(false);

    const errors = useMemo(() => {
        const next = {};
        const emailValue = email.trim();

        if (!emailValue) {
            next.email = 'Введите email';
        } else if (!emailPattern.test(emailValue)) {
            next.email = 'Введите корректный email';
        }

        return next;
    }, [email]);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;

        setSubmitted(true);
        if (Object.keys(errors).length > 0) {
            return;
        }

        setLoading(true);
        try {
            await requestPasswordReset({email: email.trim()});
            setRequestSent(true);
            notify.success('Если email зарегистрирован, письмо отправлено');
        } catch (error) {
            notify.error(error?.message || 'Не удалось отправить письмо');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.shellSingle}>
                <section className={styles.panel}>
                    <div className={styles.head}>
                        <h1 className={styles.title}>Восстановление пароля</h1>
                        <p className={styles.subtitle}>Введите email, и мы отправим ссылку для смены пароля.</p>
                    </div>

                    <form className={styles.form} onSubmit={onSubmit} noValidate>
                        <label className={styles.field}>
                            <span className={styles.label}>
                                Email
                                <span className={styles.labelRequired}>*</span>
                            </span>
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

                        <button className={styles.btnPrimary} type="submit" disabled={loading}>
                            {loading ? 'Отправляем...' : 'Отправить ссылку'}
                        </button>

                        {requestSent ? (
                            <div className={`${styles.statusBox} ${styles.statusSuccess}`}>
                                Запрос принят. Проверьте входящие и папку «Спам».
                            </div>
                        ) : null}

                        <div className={styles.linksRow}>
                            <button type="button" className={styles.link} onClick={() => navigate('/login')}>
                                Назад ко входу
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
