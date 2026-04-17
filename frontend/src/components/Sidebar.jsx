import {useEffect, useMemo, useState} from 'react';
import styles from '../styles/Sidebar.module.css';

function sanitizePriceInput(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

function formatPriceInput(value) {
    const digits = sanitizePriceInput(value);
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function Sidebar({
    categoryTree,
    selectedCategoryId,
    onSelectCategory,
    priceMin,
    priceMax,
    priceBounds,
    onApplyPrice,
    onResetPrice,
    sortValue,
    sortOptions,
    onSelectSort,
    brands,
    selectedBrandId,
    onSelectBrand,
    characteristics,
    selectedCharacteristics,
    onToggleCharacteristic,
    onClearFilters,
    hasActiveFilters,
}) {
    const [expandedParents, setExpandedParents] = useState({});
    const [visibleBrandsCount, setVisibleBrandsCount] = useState(10);
    const [visibleCharacteristicsCount, setVisibleCharacteristicsCount] = useState(8);
    const [priceMinDraft, setPriceMinDraft] = useState(priceMin || '');
    const [priceMaxDraft, setPriceMaxDraft] = useState(priceMax || '');

    useEffect(() => {
        const next = {};
        categoryTree.forEach((parent) => {
            const isActiveParent = parent.id === selectedCategoryId;
            const hasSelectedChild = parent.children.some((child) => child.id === selectedCategoryId);
            next[parent.id] = isActiveParent || hasSelectedChild;
        });
        setExpandedParents(next);
    }, [categoryTree, selectedCategoryId]);

    useEffect(() => {
        setPriceMinDraft(formatPriceInput(priceMin || ''));
    }, [priceMin]);

    useEffect(() => {
        setPriceMaxDraft(formatPriceInput(priceMax || ''));
    }, [priceMax]);

    const selectedParentId = useMemo(() => {
        for (const parent of categoryTree) {
            if (parent.id === selectedCategoryId) return parent.id;
            if (parent.children.some((child) => child.id === selectedCategoryId)) return parent.id;
        }
        return null;
    }, [categoryTree, selectedCategoryId]);

    const visibleBrands = useMemo(() => {
        return brands.slice(0, visibleBrandsCount);
    }, [brands, visibleBrandsCount]);

    const visibleCharacteristics = useMemo(() => {
        return characteristics.slice(0, visibleCharacteristicsCount);
    }, [characteristics, visibleCharacteristicsCount]);

    useEffect(() => {
        setVisibleBrandsCount(10);
    }, [brands]);

    useEffect(() => {
        setVisibleCharacteristicsCount(8);
    }, [characteristics]);

    const handleApplyPrice = () => {
        const nextMin = sanitizePriceInput(priceMinDraft);
        const nextMax = sanitizePriceInput(priceMaxDraft);
        onApplyPrice(nextMin, nextMax);
    };

    const handleResetPrice = () => {
        setPriceMinDraft('');
        setPriceMaxDraft('');
        onResetPrice();
    };

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
                        const handleSelectParent = () => onSelectCategory(parent.id);

                        return (
                            <div
                                className={`${styles.group} ${isParentActive ? styles.activeGroup : ''}`}
                                key={parent.id}
                                onClick={handleSelectParent}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleSelectParent();
                                    }
                                }}
                            >
                                <div className={styles.groupHead}>
                                    <div
                                        className={`${styles.parentButton} ${isParentSelected ? styles.selectedParent : ''}`}
                                    >
                                        <span className={styles.parentName}>{parent.name}</span>
                                        {parent.children.length > 0 ? (
                                            <span className={styles.parentMeta}>{parent.children.length}</span>
                                        ) : null}
                                    </div>

                                    {parent.children.length > 0 ? (
                                        <button
                                            type="button"
                                            className={`${styles.toggleButton} ${isExpanded ? styles.toggleOpen : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleParent(parent.id);
                                            }}
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
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectCategory(child.id);
                                                }}
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
                <div className={styles.title}>Цена</div>
                <div className={styles.priceGrid}>
                    <label className={styles.priceField}>
                        <span className={styles.priceLabel}>От</span>
                        <div className={styles.priceInputWrap}>
                            <input
                                type="text"
                                inputMode="numeric"
                                className={styles.priceInput}
                                value={priceMinDraft}
                                onChange={(e) => setPriceMinDraft(formatPriceInput(e.target.value))}
                                placeholder={priceBounds?.min != null ? formatPriceInput(Math.floor(priceBounds.min)) : '0'}
                            />
                            <span className={styles.priceSuffix}>₽</span>
                        </div>
                    </label>
                    <label className={styles.priceField}>
                        <span className={styles.priceLabel}>До</span>
                        <div className={styles.priceInputWrap}>
                            <input
                                type="text"
                                inputMode="numeric"
                                className={styles.priceInput}
                                value={priceMaxDraft}
                                onChange={(e) => setPriceMaxDraft(formatPriceInput(e.target.value))}
                                placeholder={priceBounds?.max != null ? formatPriceInput(Math.ceil(priceBounds.max)) : '0'}
                            />
                            <span className={styles.priceSuffix}>₽</span>
                        </div>
                    </label>
                </div>
                <div className={styles.priceActions}>
                    <button type="button" className={styles.priceApplyBtn} onClick={handleApplyPrice}>
                        Применить
                    </button>
                    <button type="button" className={styles.priceResetBtn} onClick={handleResetPrice}>
                        Сбросить
                    </button>
                </div>
            </div>

            <div className={styles.divider}/>

            <div className={styles.block}>
                <div className={styles.title}>Бренды</div>
                <div className={styles.compactList}>
                    <button
                        type="button"
                        className={`${styles.compactBtn} ${selectedBrandId == null ? styles.compactBtnActive : ''}`}
                        onClick={() => onSelectBrand(null)}
                    >
                        Все бренды
                    </button>

                    {visibleBrands.map((brand) => (
                        <button
                            key={brand.id}
                            type="button"
                            className={`${styles.compactBtn} ${selectedBrandId === brand.id ? styles.compactBtnActive : ''}`}
                            onClick={() => onSelectBrand(brand.id)}
                        >
                            <span>{brand.name}</span>
                            {brand.count != null ? <span className={styles.compactCount}>{brand.count}</span> : null}
                        </button>
                    ))}

                    {brands.length > visibleBrandsCount ? (
                        <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setVisibleBrandsCount((prev) => Math.min(prev + 20, brands.length))}
                        >
                            Показать еще бренды ({brands.length - visibleBrandsCount})
                        </button>
                    ) : null}
                    {visibleBrandsCount > 10 ? (
                        <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setVisibleBrandsCount(10)}
                        >
                            Свернуть список брендов
                        </button>
                    ) : null}
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

            <div className={styles.divider}/>

            <div className={styles.block}>
                <div className={styles.title}>Характеристики</div>
                {characteristics.length === 0 ? (
                    <div className={styles.placeholderText}>
                        Фильтры появятся автоматически, когда в карточках товаров будут заполнены характеристики.
                    </div>
                ) : (
                    <div className={styles.facetsWrap}>
                        {visibleCharacteristics.map((facet) => (
                            <div className={styles.facetGroup} key={facet.name}>
                                <div className={styles.facetTitle}>{facet.name}</div>
                                <div className={styles.facetValues}>
                                    {facet.values.map((value) => {
                                        const itemValue = typeof value === 'string' ? value : value?.value;
                                        if (!itemValue) return null;
                                        const itemCount = typeof value === 'string' ? null : value?.count;
                                        const isActive = (selectedCharacteristics[facet.name] || []).includes(itemValue);
                                        return (
                                            <button
                                                type="button"
                                                key={itemValue}
                                                className={`${styles.facetBtn} ${isActive ? styles.facetBtnActive : ''}`}
                                                onClick={() => onToggleCharacteristic(facet.name, itemValue)}
                                            >
                                                <span>{itemValue}</span>
                                                {itemCount != null ? <span className={styles.facetCount}>{itemCount}</span> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {characteristics.length > visibleCharacteristicsCount ? (
                            <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => setVisibleCharacteristicsCount((prev) => Math.min(prev + 8, characteristics.length))}
                            >
                                Показать еще характеристики ({characteristics.length - visibleCharacteristicsCount})
                            </button>
                        ) : null}
                        {visibleCharacteristicsCount > 8 ? (
                            <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => setVisibleCharacteristicsCount(8)}
                            >
                                Свернуть характеристики
                            </button>
                        ) : null}
                    </div>
                )}
            </div>

            {hasActiveFilters ? (
                <button
                    type="button"
                    className={styles.resetBtn}
                    onClick={onClearFilters}
                >
                    Сбросить все фильтры
                </button>
            ) : null}
        </aside>
    );
}
