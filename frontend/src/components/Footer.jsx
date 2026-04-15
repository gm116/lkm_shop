import styles from '../styles/Footer.module.css';
import {Link} from 'react-router-dom';

export default function Footer({onOpenFeedback}) {
    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <div className={styles.column}>
                    <div className={styles.title}>Покупателям</div>
                    <Link to="/catalog" className={styles.link}>Каталог</Link>
                    <span className={styles.link}>Доставка и оплата</span>
                    <span className={styles.link}>Возврат и обмен</span>
                    <button type="button" className={`${styles.link} ${styles.linkButton}`} onClick={onOpenFeedback}>
                        Обратная связь
                    </button>
                </div>

                <div className={styles.column}>
                    <div className={styles.title}>Компания</div>
                    <Link to="/" className={styles.link}>О компании</Link>
                    <span className={styles.link}>Пользовательское соглашение</span>
                    <span className={styles.link}>Политика конфиденциальности</span>
                </div>

                <div className={styles.column}>
                    <div className={styles.title}>Контакты</div>
                    <div className={styles.text}>support@shop-demo.ru</div>
                    <div className={styles.text}>+7 (999) 123-45-67</div>
                    <div className={styles.text}>Набережные Челны, Россия</div>
                    <div className={styles.textSmall}>Пн–Пт · 08:00–17:00</div>
                </div>
            </div>

            <div className={styles.bottom}>
                <span>
                    © {new Date().getFullYear()} Магазин. Все права защищены.
                </span>
                <span className={styles.disclaimer}>
                    Учебный проект. Заказы не обрабатываются.
                </span>
            </div>
        </footer>
    );
}
