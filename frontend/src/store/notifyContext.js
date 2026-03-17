import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import styles from '../styles/Notify.module.css';

const NotifyContext = createContext(null);

const DEFAULT_DURATION = 3200;
const DEDUPE_WINDOW_MS = 1200;

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function titleByType(type) {
    if (type === 'success') return 'Успешно';
    if (type === 'error') return 'Ошибка';
    if (type === 'warning') return 'Внимание';
    return 'Информация';
}

export function NotifyProvider({children}) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef(new Map());
    const recentRef = useRef(new Map());

    const remove = useCallback((id) => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
        const timer = timersRef.current.get(id);
        if (timer) {
            window.clearTimeout(timer);
            timersRef.current.delete(id);
        }
    }, []);

    const push = useCallback((message, options = {}) => {
        const text = String(message || '').trim();
        if (!text) return null;

        const type = options.type || 'info';
        const duration = Number(options.duration || DEFAULT_DURATION);
        const dedupeKey = `${type}:${text}`;
        const now = Date.now();
        const lastShownAt = recentRef.current.get(dedupeKey);
        if (lastShownAt && now - lastShownAt < DEDUPE_WINDOW_MS) {
            return null;
        }
        recentRef.current.set(dedupeKey, now);

        const id = createId();
        setToasts((prev) => [...prev, {id, text, type}]);

        const timer = window.setTimeout(() => {
            remove(id);
        }, duration);
        timersRef.current.set(id, timer);

        return id;
    }, [remove]);

    const clearAll = useCallback(() => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current.clear();
        setToasts([]);
    }, []);

    useEffect(() => {
        return () => {
            clearAll();
        };
    }, [clearAll]);

    const value = useMemo(() => ({
        push,
        success: (message, options = {}) => push(message, {...options, type: 'success'}),
        error: (message, options = {}) => push(message, {...options, type: 'error'}),
        info: (message, options = {}) => push(message, {...options, type: 'info'}),
        warning: (message, options = {}) => push(message, {...options, type: 'warning'}),
        remove,
        clearAll,
    }), [push, remove, clearAll]);

    return (
        <NotifyContext.Provider value={value}>
            {children}
            <div className={styles.stack} aria-live="polite" aria-atomic="false">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`${styles.toast} ${styles[`toast_${toast.type}`] || styles.toast_info}`}>
                        <div className={styles.body}>
                            <div className={styles.title}>{titleByType(toast.type)}</div>
                            <div className={styles.text}>{toast.text}</div>
                        </div>
                        <button
                            type="button"
                            className={styles.close}
                            onClick={() => remove(toast.id)}
                            aria-label="Закрыть уведомление"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </NotifyContext.Provider>
    );
}

export function useNotify() {
    const context = useContext(NotifyContext);
    if (!context) {
        throw new Error('useNotify must be used inside NotifyProvider');
    }
    return context;
}
