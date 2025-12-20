import {useEffect, useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import styles from '../styles/CatalogPage.module.css';
import {getCategories, getProducts} from '../api/catalog';

function useQuery() {
    const {search} = useLocation();
    return useMemo(() => new URLSearchParams(search), [search]);
}

export default function CatalogPage() {
    const query = useQuery();

    const [categories, setCategories] = useState([{id: null, name: 'Все'}]);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [sortKey, setSortKey] = useState('default'); // добавили

    const search = query.get('search') || '';

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setError('');
                const data = await getCategories();
                if (cancelled) return;

                setCategories([{id: null, name: 'Все'}, ...data]);
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

    const categoryNames = categories.map(c => c.name);
    const selectedCategoryName = categories.find(c => c.id === selectedCategoryId)?.name || 'Все';

    const categoryNameToId = useMemo(() => {
        const map = new Map();
        categories.forEach(c => map.set(c.name, c.id));
        return map;
    }, [categories]);

    const handleSelectCategory = (name) => {
        const id = categoryNameToId.get(name);
        setSelectedCategoryId(id ?? null);
    };

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

    return (
        <div className={styles.catalogWrapper}>
            <div className={styles.catalogHead}>
                <div className={styles.catalogTitle}>Каталог товаров</div>

            </div>

            <div className={styles.topRow}>
                <div className={styles.sidebarBlock}>
                    <Sidebar
                        categories={categoryNames}
                        selectedCategory={selectedCategoryName}
                        onSelectCategory={handleSelectCategory}

                        sortValue={sortKey}
                        sortOptions={sortOptions}
                        onSelectSort={setSortKey}
                    />
                </div>

                <div className={styles.mainBlock}>
                    {error && (
                        <div className={styles.emptyCard}>
                            <span className={styles.notFound}>{error}</span>
                        </div>
                    )}

                    {!error && loading && (
                        <div className={styles.emptyCard}>
                            <span className={styles.notFound}>Загрузка...</span>
                        </div>
                    )}

                    {!error && !loading && (
                        <div className={styles.productsGrid}>
                            {sortedProducts.length === 0 ? (
                                <div className={styles.emptyCard}>
                                    <span className={styles.notFound}>Нет товаров по заданным фильтрам</span>
                                </div>
                            ) : (
                                sortedProducts.map(product => (
                                    <ProductCard product={product} key={product.id}/>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}