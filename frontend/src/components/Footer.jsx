import styles from '../styles/Footer.module.css';
import {Link} from 'react-router-dom';
import {siteConfig} from '../config/siteConfig';

export default function Footer({onOpenFeedback}) {
    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <div className={styles.column}>
                    <div className={styles.title}>Покупателям</div>
                    <Link to="/catalog" className={styles.link}>Каталог</Link>
                    <Link to="/legal/delivery-payment" className={styles.link}>Доставка и оплата</Link>
                    <Link to="/legal/returns" className={styles.link}>Возврат и обмен</Link>
                    <button type="button" className={`${styles.link} ${styles.linkButton}`} onClick={onOpenFeedback}>
                        Обратная связь
                    </button>
                </div>

                <div className={styles.column}>
                    <div className={styles.title}>Компания</div>
                    <Link to="/" className={styles.link}>О компании</Link>
                    <Link to="/legal/offer" className={styles.link}>Публичная оферта</Link>
                    <Link to="/legal/terms" className={styles.link}>Пользовательское соглашение</Link>
                    <Link to="/legal/privacy" className={styles.link}>Политика конфиденциальности</Link>
                </div>

                <div className={styles.column}>
                    <div className={styles.title}>Контакты</div>
                    <div className={styles.text}>{siteConfig.contactEmail}</div>
                    <div className={styles.text}>{siteConfig.contactPhone}</div>
                    <div className={styles.text}>{siteConfig.contactCity}, Россия</div>
                    <div className={styles.textSmall}>{siteConfig.workHours}</div>
                </div>
            </div>

            <div className={styles.bottom}>
                <span>
                    © {new Date().getFullYear()} {siteConfig.storeName}. Все права защищены.
                </span>
            </div>
        </footer>
    );
}
