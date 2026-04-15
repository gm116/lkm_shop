import {useEffect, useMemo, useRef, useState} from 'react';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/FeedbackModal.module.css';

const EMPTY_FORM = {
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
};

function normalizePhone(value) {
    const input = String(value || '');
    const trimmed = input.trim();
    const startsWithPlus = trimmed.startsWith('+');
    const hasUserPlusSeven = /^\+?\s*7/.test(trimmed);

    const digits = input.replace(/\D/g, '');
    let local = digits;
    if (local.startsWith('7') || local.startsWith('8')) {
        local = local.slice(1);
    }
    local = local.slice(0, 10);

    if (!trimmed) return '';
    if (!local && (hasUserPlusSeven || startsWithPlus)) return '+7';
    if (!local) return '';

    let out = '+7';
    if (local.length > 0) {
        out += ` (${local.slice(0, Math.min(3, local.length))}`;
    }
    if (local.length > 3) {
        out += ')';
        out += ` ${local.slice(3, Math.min(6, local.length))}`;
    }
    if (local.length > 6) out += `-${local.slice(6, Math.min(8, local.length))}`;
    if (local.length > 8) out += `-${local.slice(8, 10)}`;
    return out;
}

function emailIsValid(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function phoneIsValid(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    const digits = text.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('7');
}

export default function FeedbackModal({open, onClose}) {
    const {user} = useAuth();
    const notify = useNotify();

    const [saving, setSaving] = useState(false);
    const [sent, setSent] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [touched, setTouched] = useState({
        email: false,
        phone: false,
        subject: false,
        message: false,
    });
    const messageRef = useRef(null);

    const errors = useMemo(() => {
        const next = {
            email: '',
            phone: '',
            subject: '',
            message: '',
        };

        if (!form.email.trim()) {
            next.email = 'Укажите email для ответа';
        } else if (!emailIsValid(form.email)) {
            next.email = 'Введите корректный email';
        }

        if (!phoneIsValid(form.phone)) {
            next.phone = 'Неверный формат телефона';
        }

        if (!form.subject.trim()) {
            next.subject = 'Укажите тему обращения';
        }

        if (!form.message.trim()) {
            next.message = 'Опишите ваш вопрос';
        } else if (form.message.trim().length < 10) {
            next.message = 'Сообщение слишком короткое (минимум 10 символов)';
        }

        return next;
    }, [form]);

    const hasInvalid = useMemo(() => Object.values(errors).some(Boolean), [errors]);

    useEffect(() => {
        if (!open) return;
        setSubmitAttempted(false);
        setSent(false);
        setTouched({
            email: false,
            phone: false,
            subject: false,
            message: false,
        });
        setForm({
            ...EMPTY_FORM,
            name: [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim(),
            email: user?.email || '',
        });
    }, [open, user?.email, user?.first_name, user?.last_name]);

    useEffect(() => {
        if (!open) return undefined;

        const onEsc = (event) => {
            if (event.key === 'Escape') onClose?.();
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onEsc);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onEsc);
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !messageRef.current) return;
        const el = messageRef.current;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }, [open, form.message]);

    if (!open) return null;

    const submit = async (event) => {
        event.preventDefault();
        setSubmitAttempted(true);

        const payload = {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            subject: form.subject.trim(),
            message: form.message.trim(),
        };

        if (hasInvalid) {
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/users/feedback/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось отправить обращение');
            }
            setSent(true);
        } catch (e) {
            const message = e?.message || 'Ошибка отправки';
            notify.error(message);
        } finally {
            setSaving(false);
        }
    };

    const messageTrimmed = form.message.trim();
    const messageTooShort = messageTrimmed.length > 0 && messageTrimmed.length < 10;

    const showError = (field) => {
        if (!errors[field]) return false;
        if (field === 'phone') {
            return submitAttempted;
        }
        if (field === 'message' && messageTooShort) {
            return submitAttempted;
        }
        return !!(submitAttempted || touched[field]);
    };
    const fieldClass = (field) => (showError(field) ? styles.inputInvalid : '');

    if (sent) {
        return (
            <div className={styles.overlay} onClick={() => onClose?.()}>
                <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.successWrap}>
                        <div className={styles.successIcon}>✓</div>
                        <h2 className={styles.successTitle}>Сообщение отправлено</h2>
                        <div className={styles.successText}>Мы ответим на email в ближайшее время.</div>
                        <button type="button" className={styles.primaryBtn} onClick={() => onClose?.()}>
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay} onClick={() => onClose?.()}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.head}>
                    <div>
                        <h2 className={styles.title}>Обратная связь</h2>
                        <div className={styles.sub}>Оставьте контакт и вопрос. Ответ придет на email.</div>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={() => onClose?.()} aria-label="Закрыть">
                        ×
                    </button>
                </div>

                <form className={styles.form} onSubmit={submit}>
                    <div className={styles.row2}>
                        <label className={styles.field}>
                            <span className={styles.labelText}>Как к вам обращаться</span>
                            <input
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({...prev, name: e.target.value}))}
                                placeholder="Например, Иван"
                            />
                        </label>
                        <label className={styles.field}>
                            <div className={styles.labelRow}>
                                <span className={styles.labelText}>
                                    Email <span className={styles.requiredStar}>*</span>
                                </span>
                                <span
                                    className={`${styles.fieldError} ${showError('email') ? styles.fieldErrorVisible : ''}`}
                                    aria-live="polite"
                                >
                                    {errors.email || '\u00A0'}
                                </span>
                            </div>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => {
                                    setTouched((prev) => ({...prev, email: true}));
                                    setForm((prev) => ({...prev, email: e.target.value}));
                                }}
                                placeholder="example@mail.ru"
                                className={fieldClass('email')}
                            />
                        </label>
                    </div>

                    <div className={styles.row2}>
                        <label className={styles.field}>
                            <div className={styles.labelRow}>
                                <span className={styles.labelText}>Телефон (необязательно)</span>
                                <span
                                    className={`${styles.fieldError} ${showError('phone') ? styles.fieldErrorVisible : ''}`}
                                    aria-live="polite"
                                >
                                    {errors.phone || '\u00A0'}
                                </span>
                            </div>
                            <input
                                value={form.phone}
                                onChange={(e) => {
                                    setTouched((prev) => ({...prev, phone: true}));
                                    setForm((prev) => ({...prev, phone: normalizePhone(e.target.value)}));
                                }}
                                placeholder="+7 (___) ___-__-__"
                                className={fieldClass('phone')}
                            />
                        </label>

                        <label className={styles.field}>
                            <div className={styles.labelRow}>
                                <span className={styles.labelText}>
                                    Тема обращения <span className={styles.requiredStar}>*</span>
                                </span>
                                <span
                                    className={`${styles.fieldError} ${showError('subject') ? styles.fieldErrorVisible : ''}`}
                                    aria-live="polite"
                                >
                                    {errors.subject || '\u00A0'}
                                </span>
                            </div>
                            <input
                                value={form.subject}
                                onChange={(e) => {
                                    setTouched((prev) => ({...prev, subject: true}));
                                    setForm((prev) => ({...prev, subject: e.target.value}));
                                }}
                                className={fieldClass('subject')}
                            />
                        </label>
                    </div>

                    <label className={styles.field}>
                        <div className={styles.labelRow}>
                            <span className={styles.labelText}>
                                Опишите ваш вопрос <span className={styles.requiredStar}>*</span>
                            </span>
                            <span
                                className={`${styles.fieldError} ${showError('message') ? styles.fieldErrorVisible : ''}`}
                                aria-live="polite"
                            >
                                {errors.message || '\u00A0'}
                            </span>
                        </div>
                        <textarea
                            ref={messageRef}
                            rows="5"
                            value={form.message}
                            onChange={(e) => {
                                setTouched((prev) => ({...prev, message: true}));
                                setForm((prev) => ({...prev, message: e.target.value}));
                            }}
                            className={fieldClass('message')}
                        />
                    </label>

                    <div className={styles.actions}>
                        <button type="button" className={styles.secondaryBtn} onClick={() => onClose?.()} disabled={saving}>
                            Отмена
                        </button>
                        <button type="submit" className={styles.primaryBtn} disabled={saving}>
                            {saving ? 'Отправляю…' : 'Отправить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
