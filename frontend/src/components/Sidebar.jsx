import styles from '../styles/Sidebar.module.css';

export default function Sidebar({
    categories,
    selectedCategory,
    onSelectCategory,

    sortValue,
    sortOptions,
    onSelectSort,
}) {
    return (
        <aside className={styles.sidebar}>
            {/* КАТЕГОРИИ */}
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

            {/* РАЗДЕЛИТЕЛЬ */}
            <div className={styles.divider} />

            {/* СОРТИРОВКА */}
            <div className={styles.title}>Сортировка</div>
            <ul className={styles.list}>
                {sortOptions.map(opt => (
                    <li
                        key={opt.value}
                        className={`${styles.sidebarItem} ${sortValue === opt.value ? styles.selected : ''}`}
                        onClick={() => onSelectSort(opt.value)}
                    >
                        {opt.label}
                    </li>
                ))}
            </ul>
        </aside>
    );
}