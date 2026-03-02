import {useEffect, useMemo, useState} from 'react';
import styles from '../styles/Sidebar.module.css';

export default function Sidebar({
    categoryTree,
    selectedCategoryId,
    onSelectCategory,
    sortValue,
    sortOptions,
    onSelectSort,
}) {
    const [expandedParents, setExpandedParents] = useState({});

    useEffect(() => {
        const next = {};
        categoryTree.forEach((parent) => {
            const isActiveParent = parent.id === selectedCategoryId;
            const hasSelectedChild = parent.children.some((child) => child.id === selectedCategoryId);
            next[parent.id] = isActiveParent || hasSelectedChild;
        });
        setExpandedParents(next);
    }, [categoryTree, selectedCategoryId]);

    const selectedParentId = useMemo(() => {
        for (const parent of categoryTree) {
            if (parent.id === selectedCategoryId) return parent.id;
            if (parent.children.some((child) => child.id === selectedCategoryId)) return parent.id;
        }
        return null;
    }, [categoryTree, selectedCategoryId]);

    const toggleParent = (parentId) => {
        setExpandedParents((prev) => {
            const shouldOpen = !prev[parentId];
            const next = {};
            categoryTree.forEach((parent) => {
                next[parent.id] = false;
            });
            next[parentId] = shouldOpen;
            return next;
        });
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.block}>
                <div className={styles.title}>Категории</div>

                <button
                    type="button"
                    className={`${styles.allButton} ${selectedCategoryId == null ? styles.selectedAll : ''}`}
                    onClick={() => onSelectCategory(null)}
                >
                    <span>Все товары</span>
                    <span className={styles.allHint}>Без фильтра по категории</span>
                </button>

                <div className={styles.categoryTree}>
                    {categoryTree.map((parent) => {
                        const isParentSelected = parent.id === selectedCategoryId;
                        const isParentActive = selectedParentId === parent.id;
                        const isExpanded = expandedParents[parent.id] ?? true;

                        return (
                            <div className={styles.group} key={parent.id}>
                                <div className={styles.groupHead}>
                                    <button
                                        type="button"
                                        className={`${styles.parentButton} ${isParentSelected ? styles.selectedParent : ''} ${isParentActive ? styles.activeGroup : ''}`}
                                        onClick={() => onSelectCategory(parent.id)}
                                    >
                                        <span className={styles.parentName}>{parent.name}</span>
                                        {parent.children.length > 0 ? (
                                            <span className={styles.parentMeta}>{parent.children.length}</span>
                                        ) : null}
                                    </button>

                                    {parent.children.length > 0 ? (
                                        <button
                                            type="button"
                                            className={`${styles.toggleButton} ${isExpanded ? styles.toggleOpen : ''}`}
                                            onClick={() => toggleParent(parent.id)}
                                            aria-label={isExpanded ? 'Свернуть подкатегории' : 'Развернуть подкатегории'}
                                        >
                                            ▾
                                        </button>
                                    ) : null}
                                </div>

                                {parent.children.length > 0 && isExpanded ? (
                                    <div className={styles.childList}>
                                        {parent.children.map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                className={`${styles.childButton} ${child.id === selectedCategoryId ? styles.selectedChild : ''}`}
                                                onClick={() => onSelectCategory(child.id)}
                                            >
                                                {child.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.divider}/>

            <div className={styles.block}>
                <div className={styles.title}>Сортировка</div>
                <ul className={styles.list}>
                    {sortOptions.map((opt) => (
                        <li
                            key={opt.value}
                            className={`${styles.sidebarItem} ${sortValue === opt.value ? styles.selectedSort : ''}`}
                            onClick={() => onSelectSort(opt.value)}
                        >
                            {opt.label}
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
}
