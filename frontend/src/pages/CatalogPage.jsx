import {useEffect, useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import styles from '../styles/CatalogPage.module.css';
import {getCategories, getProducts} from '../api/catalog';
import {useNotify} from '../store/notifyContext';

const SKELETON_COUNT = 8;

function useQuery() {
    const {search} = useLocation();
    return useMemo(() => new URLSearchParams(search), [search]);
}

export default function CatalogPage() {
    const notify = useNotify();
    const query = useQuery();
    const categoryParam = query.get('category');
    const parsedCategoryId = categoryParam && !Number.isNaN(Number(categoryParam)) ? Number(categoryParam) : null;

    const [categories, setCategories] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState(parsedCategoryId);

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [sortKey, setSortKey] = useState('default'); // добавили

    const search = query.get('search') || '';

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    useEffect(() => {
        setSelectedCategoryId(parsedCategoryId);
    }, [parsedCategoryId]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setError('');
                const data = await getCategories();
                if (cancelled) return;

                setCategories(Array.isArray(data) ? data : []);
            } catch (e) {
                if (cancelled) return;
                setError(e.message || 'Ошибка загрузки категорий');
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError('');

                const data = await getProducts({
                    category: selectedCategoryId || null,
                    search: search || '',
                });

                if (cancelled) return;
                setProducts(data);
            } catch (e) {
                if (cancelled) return;
                setError(e.message || 'Ошибка загрузки товаров');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [selectedCategoryId, search]);

    const categoryMap = useMemo(() => {
        const map = new Map();
        categories.forEach((category) => {
            map.set(category.id, category);
        });
        return map;
    }, [categories]);

    const categoryTree = useMemo(() => {
        const byParent = new Map();
        categories.forEach((category) => {
            const parentId = category.parent ?? null;
            if (!byParent.has(parentId)) {
                byParent.set(parentId, []);
            }
            byParent.get(parentId).push(category);
        });

        const sortByName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        const roots = (byParent.get(null) || []).sort(sortByName);
        return roots.map((parent) => ({
            ...parent,
            children: (byParent.get(parent.id) || []).sort(sortByName),
        }));
    }, [categories]);

    const selectedCategory = selectedCategoryId != null ? categoryMap.get(selectedCategoryId) : null;
    const selectedParentCategory = selectedCategory?.parent ? categoryMap.get(selectedCategory.parent) : selectedCategory;
    const selectedCategoryName = selectedCategory?.name || 'Все товары';
    const selectedCategoryPath = selectedCategory?.parent && selectedParentCategory
        ? `${selectedParentCategory.name} / ${selectedCategory.name}`
        : selectedCategoryName;

    const sortOptions = useMemo(() => ([
        {value: 'default', label: 'По умолчанию'},
        {value: 'price_asc', label: 'Сначала дешевле'},
        {value: 'price_desc', label: 'Сначала дороже'},
        {value: 'name_asc', label: 'Название A–Z'},
    ]), []);

    const sortedProducts = useMemo(() => {
        const arr = [...products];

        if (sortKey === 'price_asc') {
            arr.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
        } else if (sortKey === 'price_desc') {
            arr.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
        } else if (sortKey === 'name_asc') {
            arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
        }

        return arr;
    }, [products, sortKey]);

    const skeletonItems = useMemo(
        () => Array.from({length: SKELETON_COUNT}, (_, index) => `skeleton-${index}`),
        []
    );

    return (
        <div className={styles.catalogWrapper}>
            <div className={styles.headerRow}>
                <div className={styles.catalogTitleBlock}>
                    <div className={styles.catalogTitle}>Каталог товаров</div>
                    <div className={styles.catalogSub}>
                        {loading
                            ? 'Подбираем товары по выбранным фильтрам'
                            : `${sortedProducts.length} ${sortedProducts.length === 1 ? 'товар' : sortedProducts.length >= 2 && sortedProducts.length <= 4 ? 'товара' : 'товаров'} в выдаче`}
                    </div>
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.chips}>
                        <div className={styles.chip}>{selectedCategoryPath}</div>
                        {search ? <div className={styles.chip}>Поиск: {search}</div> : null}
                        {sortKey !== 'default' ? (
                            <div className={styles.chip}>
                                {sortOptions.find((option) => option.value === sortKey)?.label || 'Сортировка'}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={styles.topRow}>
                <div className={styles.sidebarBlock}>
                    <Sidebar
                        categoryTree={categoryTree}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={setSelectedCategoryId}
                        sortValue={sortKey}
                        sortOptions={sortOptions}
                        onSelectSort={setSortKey}
                    />
                </div>

                <div className={styles.mainBlock}>
                    <div className={styles.gridFrame}>
                        <div className={styles.productsGrid}>
                            {loading && skeletonItems.map(item => (
                                <div className={styles.skeletonCard} key={item} aria-hidden="true">
                                    <div className={styles.skeletonImg}/>
                                    <div className={styles.skeletonLine}/>
                                    <div className={styles.skeletonLineShort}/>
                                    <div className={styles.skeletonBtn}/>
                                </div>
                            ))}

                            {!loading && !error && sortedProducts.map(product => (
                                <ProductCard product={product} key={product.id}/>
                            ))}

                            {error && (
                                <div className={styles.emptyCard}>
                                    <span className={styles.notFound}>{error}</span>
                                </div>
                            )}

                            {!error && loading && (
                                <div className={styles.statusCard}>
                                    <span className={styles.notFound}>Загрузка...</span>
                                </div>
                            )}

                            {!error && !loading && sortedProducts.length === 0 && (
                                <div className={styles.emptyCard}>
                                    <span className={styles.notFound}>Нет товаров по заданным фильтрам</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
