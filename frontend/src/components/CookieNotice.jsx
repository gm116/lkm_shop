import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';

import styles from '../styles/CookieNotice.module.css';

const COOKIE_NOTICE_KEY = 'cookie_notice_accepted_v1';

function getInitialVisible() {
    try {
        return localStorage.getItem(COOKIE_NOTICE_KEY) !== 'true';
    } catch {
        return true;
    }
}

export default function CookieNotice() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(getInitialVisible());
    }, []);

    const accept = () => {
        try {
            localStorage.setItem(COOKIE_NOTICE_KEY, 'true');
        } catch {
            // Баннер остается работоспособным даже если localStorage недоступен.
        }
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className={styles.wrap} role="region" aria-label="Уведомление о cookie">
            <div className={styles.text}>
                Сайт использует технические cookie и localStorage для входа, корзины и стабильной работы сервиса.
                Продолжая использовать сайт, вы соглашаетесь с их применением.
                {' '}
                <Link to="/legal/privacy">Политика конфиденциальности</Link>
            </div>
            <button type="button" className={styles.button} onClick={accept}>
                Понятно
            </button>
        </div>
    );
}
