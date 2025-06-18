import styles from '../styles/Footer.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
      <span className={styles.text}>
        © {new Date().getFullYear()} Магазин. Все права защищены.
      </span>
        </footer>
    );
}