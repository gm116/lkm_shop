import styles from '../styles/Sidebar.module.css';

export default function Sidebar({categories, selectedCategory, onSelectCategory}) {
    return (
        <aside className={styles.sidebar}>
            <div className={styles.title}>Категории</div>
            <ul className={styles.list}>
                {categories.map(cat => (
                    <li
                        key={cat}
                        className={`${styles.sidebarItem} ${selectedCategory === cat ? styles.selected : ''}`}
                        onClick={() => onSelectCategory(cat)}
                    >
                        {cat}
                    </li>
                ))}
            </ul>
        </aside>
    );
}