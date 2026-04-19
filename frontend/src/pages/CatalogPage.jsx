import {useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import styles from '../styles/CatalogPage.module.css';
import {getBrands, getCatalogFilters, getCategories, getProducts} from '../api/catalog';
import {useNotify} from '../store/notifyContext';

const SKELETON_COUNT = 8;
const PAGE_SIZE_OPTIONS = [12, 24, 36];
const SORT_OPTIONS = [
    {value: 'default', label: 'По умолчанию'},
    {value: 'price_asc', label: 'Сначала дешевле'},
    {value: 'price_desc', label: 'Сначала дороже'},
    {value: 'name_asc', label: 'По названию (А-Я)'},
];
const SORT_KEYS = new Set(SORT_OPTIONS.map((option) => option.value));
const DEFAULT_PAGE_SIZE = 24;

function parseNumericParam(value) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseEnumParam(value, allowed, fallback) {
    if (!value) return fallback;
    return allowed.has(value) ? value : fallback;
}

function parsePageSizeParam(value) {
    const parsed = Number(value);
    return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function parsePositiveIntParam(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
}

function parseCharacteristicParams(query) {
    const parsed = {};
    query.getAll('facet').forEach((raw) => {
        const separatorIndex = raw.indexOf('::');
        if (separatorIndex <= 0) return;

        const name = raw.slice(0, separatorIndex).trim();
        const value = raw.slice(separatorIndex + 2).trim();
        if (!name || !value) return;

        if (!parsed[name]) {
            parsed[name] = [];
        }
        if (!parsed[name].includes(value)) {
            parsed[name].push(value);
        }
    });

    Object.keys(parsed).forEach((name) => {
        parsed[name].sort((a, b) => a.localeCompare(b, 'ru'));
    });

    return parsed;
}

function serializeSelectedCharacteristics(selected) {
    const normalized = Object.entries(selected || {})
        .map(([name, values]) => {
            const uniqueValues = Array.from(new Set((values || []).filter(Boolean)));
            return [name, uniqueValues.sort((a, b) => a.localeCompare(b, 'ru'))];
        })
        .filter(([, values]) => values.length > 0)
        .sort((a, b) => a[0].localeCompare(b[0], 'ru'));

    return JSON.stringify(normalized);
}

function parsePriceParam(value) {
    if (value == null || value === '') return '';
    const numeric = String(value).replace(/[^\d]/g, '');
    return numeric;
}

function normalizeFacetOptions(facets = []) {
    if (!Array.isArray(facets)) return [];
    return facets
        .map((facet) => ({
            name: String(facet?.name || '').trim(),
            total_values: Number(facet?.total_values || 0),
            values: (Array.isArray(facet?.values) ? facet.values : [])
                .map((item) => {
                    if (typeof item === 'string') {
                        return {value: item, count: null};
                    }
                    return {
                        value: String(item?.value || '').trim(),
                        count: item?.count == null ? null : Number(item.count),
                    };
                })
                .filter((item) => item.value),
        }))
        .filter((facet) => facet.name && facet.values.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function hasStock(product) {
    if (product?.stock == null) return true;
    return Number(product.stock) > 0;
}

function normalizeBound(value, mode) {
    if (value == null) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    if (mode === 'min') return Math.max(0, Math.floor(numeric));
    return Math.max(0, Math.ceil(numeric));
}

export default function CatalogPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const notify = useNotify();
    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const categoryParam = parseNumericParam(query.get('category'));
    const brandParam = parseNumericParam(query.get('brand'));
    const priceMinParam = parsePriceParam(query.get('price_min'));
    const priceMaxParam = parsePriceParam(query.get('price_max'));
    const sortParam = parseEnumParam(query.get('sort'), SORT_KEYS, 'default');
    const pageSizeParam = parsePageSizeParam(query.get('page_size'));
    const pageParam = parsePositiveIntParam(query.get('page'), 1);
    const characteristicsParam = useMemo(() => parseCharacteristicParams(query), [query]);
    const characteristicsParamSignature = useMemo(
        () => serializeSelectedCharacteristics(characteristicsParam),
        [characteristicsParam],
    );

    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [brandFacets, setBrandFacets] = useState([]);

    const [selectedCategoryId, setSelectedCategoryId] = useState(categoryParam);
    const [selectedBrandId, setSelectedBrandId] = useState(brandParam);
    const [selectedPriceMin, setSelectedPriceMin] = useState(priceMinParam);
    const [selectedPriceMax, setSelectedPriceMax] = useState(priceMaxParam);

    const [products, setProducts] = useState([]);
    const [characteristicFacets, setCharacteristicFacets] = useState([]);
    const [priceBounds, setPriceBounds] = useState({min: null, max: null});
    const [loading, setLoading] = useState(true);
    const [isRefetching, setIsRefetching] = useState(false);
    const hasLoadedOnceRef = useRef(false);
    const [error, setError] = useState('');
    const [requestVersion, setRequestVersion] = useState(0);

    const [sortKey, setSortKey] = useState(sortParam);
    const [pageSize, setPageSize] = useState(pageSizeParam);
    const [currentPage, setCurrentPage] = useState(pageParam);
    const [selectedCharacteristics, setSelectedCharacteristics] = useState(characteristicsParam);
    const selectedCharacteristicsSignature = useMemo(
        () => serializeSelectedCharacteristics(selectedCharacteristics),
        [selectedCharacteristics],
    );
    const shouldScrollOnPageChangeRef = useRef(false);
    const locationSearchRef = useRef(location.search);

    const search = query.get('search') || '';

    useEffect(() => {
        locationSearchRef.current = location.search;
    }, [location.search]);

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    useEffect(() => {
        setSelectedCategoryId(categoryParam);
        setSelectedBrandId(brandParam);
        setSelectedPriceMin(priceMinParam);
        setSelectedPriceMax(priceMaxParam);
        setSortKey(sortParam);
        setPageSize(pageSizeParam);
        setCurrentPage(pageParam);
        setSelectedCharacteristics((prev) => {
            const prevSignature = serializeSelectedCharacteristics(prev);
            if (prevSignature === characteristicsParamSignature) return prev;
            return characteristicsParam;
        });
    }, [
        categoryParam,
        brandParam,
        priceMinParam,
        priceMaxParam,
        sortParam,
        pageSizeParam,
        pageParam,
        characteristicsParam,
        characteristicsParamSignature,
    ]);

    useEffect(() => {
        let cancelled = false;

        async function loadLookupData() {
            try {
                setError('');
                const [categoriesData, brandsData] = await Promise.all([
                    getCategories(),
                    getBrands(),
                ]);
                if (cancelled) return;

                setCategories(Array.isArray(categoriesData) ? categoriesData : []);
                setBrands(Array.isArray(brandsData) ? brandsData : []);
            } catch (e) {
                if (cancelled) return;
                setError(e.message || 'Ошибка загрузки справочников каталога');
            }
        }

        loadLookupData();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadProductsAndFacets() {
            try {
                if (hasLoadedOnceRef.current) {
                    setIsRefetching(true);
                } else {
                    setLoading(true);
                }
                setError('');

                const params = {
                    category: selectedCategoryId || null,
                    brand: selectedBrandId || null,
                    search: search || '',
                    price_min: selectedPriceMin || null,
                    price_max: selectedPriceMax || null,
                    facets: selectedCharacteristics,
                };
                const [productsData, facetsData] = await Promise.all([
                    getProducts(params),
                    getCatalogFilters(params),
                ]);

                if (cancelled) return;
                setProducts(Array.isArray(productsData) ? productsData : []);
                setCharacteristicFacets(normalizeFacetOptions(facetsData?.attributes));
                setBrandFacets(Array.isArray(facetsData?.brands) ? facetsData.brands : []);
                setPriceBounds({
                    min: facetsData?.price?.min ?? null,
                    max: facetsData?.price?.max ?? null,
                });
                hasLoadedOnceRef.current = true;
            } catch (e) {
                if (cancelled) return;
                setError(e.message || 'Ошибка загрузки товаров');
                setProducts([]);
                setCharacteristicFacets([]);
                setBrandFacets([]);
                setPriceBounds({min: null, max: null});
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setIsRefetching(false);
                }
            }
        }

        loadProductsAndFacets();
        return () => {
            cancelled = true;
        };
    }, [
        selectedCategoryId,
        selectedBrandId,
        selectedPriceMin,
        selectedPriceMax,
        selectedCharacteristics,
        selectedCharacteristicsSignature,
        search,
        requestVersion,
    ]);

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

    useEffect(() => {
        if (loading || isRefetching) return;
        if (products.length === 0) return;
        setSelectedCharacteristics((prev) => {
            const allowedNames = new Set(characteristicFacets.map((facet) => facet.name));
            const next = {};
            Object.entries(prev).forEach(([name, values]) => {
                if (!allowedNames.has(name)) return;
                const allowedValues = characteristicFacets
                    .find((facet) => facet.name === name)?.values
                    ?.map((item) => (typeof item === 'string' ? item : item.value)) || [];
                const normalized = values.filter((value) => allowedValues.includes(value));
                if (normalized.length) {
                    next[name] = normalized;
                }
            });

            const prevSignature = serializeSelectedCharacteristics(prev);
            const nextSignature = serializeSelectedCharacteristics(next);
            return prevSignature === nextSignature ? prev : next;
        });
    }, [characteristicFacets, loading, isRefetching, products.length]);

    const selectedCategory = selectedCategoryId != null ? categoryMap.get(selectedCategoryId) : null;
    const selectedParentCategory = selectedCategory?.parent ? categoryMap.get(selectedCategory.parent) : selectedCategory;
    const selectedCategoryName = selectedCategory?.name || 'Все товары';
    const selectedCategoryPath = selectedCategory?.parent && selectedParentCategory
        ? `${selectedParentCategory.name} / ${selectedCategory.name}`
        : selectedCategoryName;

    const selectedBrandName = selectedBrandId != null
        ? (
            brandFacets.find((brand) => Number(brand.id) === Number(selectedBrandId))?.name
            || brands.find((brand) => Number(brand.id) === Number(selectedBrandId))?.name
            || 'Выбран бренд'
        )
        : null;

    const sortedProducts = useMemo(() => {
        const arr = [...products];

        arr.sort((a, b) => {
            const availabilityDiff = Number(hasStock(b)) - Number(hasStock(a));
            if (availabilityDiff !== 0) return availabilityDiff;

            if (sortKey === 'price_asc') {
                return Number(a.price || 0) - Number(b.price || 0);
            }
            if (sortKey === 'price_desc') {
                return Number(b.price || 0) - Number(a.price || 0);
            }
            if (sortKey === 'name_asc') {
                return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
            }
            return 0;
        });

        return arr;
    }, [products, sortKey]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(sortedProducts.length / pageSize)),
        [sortedProducts.length, pageSize],
    );

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const pagedProducts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return sortedProducts.slice(start, end);
    }, [sortedProducts, currentPage, pageSize]);

    const pageRangeLabel = useMemo(() => {
        if (!sortedProducts.length) return '0 из 0';
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, sortedProducts.length);
        return `${start}-${end} из ${sortedProducts.length}`;
    }, [sortedProducts.length, currentPage, pageSize]);

    const selectedCharacteristicCount = useMemo(
        () => Object.values(selectedCharacteristics).reduce((acc, values) => acc + values.length, 0),
        [selectedCharacteristics],
    );

    const hasActiveFilters = Boolean(
        selectedCategoryId
        || selectedBrandId
        || selectedPriceMin
        || selectedPriceMax
        || selectedCharacteristicCount > 0
        || sortKey !== 'default',
    );

    const visibleBrandOptions = useMemo(() => {
        if (brandFacets.length > 0) return brandFacets;
        return brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
            count: null,
        }));
    }, [brandFacets, brands]);

    const rootCategoryQuickList = useMemo(
        () => categoryTree.slice(0, 8),
        [categoryTree],
    );

    useEffect(() => {
        const params = new URLSearchParams();

        if (search) params.set('search', search);
        if (selectedCategoryId != null) params.set('category', String(selectedCategoryId));
        if (selectedBrandId != null) params.set('brand', String(selectedBrandId));
        if (selectedPriceMin) params.set('price_min', selectedPriceMin);
        if (selectedPriceMax) params.set('price_max', selectedPriceMax);
        if (sortKey !== 'default') params.set('sort', sortKey);
        if (pageSize !== DEFAULT_PAGE_SIZE) params.set('page_size', String(pageSize));
        if (currentPage > 1) params.set('page', String(currentPage));

        Object.entries(selectedCharacteristics)
            .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
            .forEach(([name, values]) => {
                [...values]
                    .sort((a, b) => a.localeCompare(b, 'ru'))
                    .forEach((value) => params.append('facet', `${name}::${value}`));
            });

        const nextSearch = params.toString();
        const currentSearchRaw = locationSearchRef.current || '';
        const currentSearch = currentSearchRaw.startsWith('?') ? currentSearchRaw.slice(1) : currentSearchRaw;

        if (nextSearch !== currentSearch) {
            navigate(
                {
                    pathname: location.pathname,
                    search: nextSearch ? `?${nextSearch}` : '',
                },
                {replace: true},
            );
        }
    }, [
        location.pathname,
        navigate,
        search,
        selectedCategoryId,
        selectedBrandId,
        sortKey,
        selectedPriceMin,
        selectedPriceMax,
        pageSize,
        currentPage,
        selectedCharacteristics,
        selectedCharacteristicsSignature,
    ]);

    const handleSelectCategory = (categoryId) => {
        setSelectedCategoryId(categoryId);
        setCurrentPage(1);
    };

    const handleSelectBrand = (brandId) => {
        setSelectedBrandId(brandId);
        setCurrentPage(1);
    };

    const handleSelectSort = (nextSort) => {
        setSortKey(nextSort);
        setCurrentPage(1);
    };

    const handlePageSizeChange = (nextSize) => {
        setPageSize(nextSize);
        setCurrentPage(1);
    };

    const goToPrevPage = () => {
        shouldScrollOnPageChangeRef.current = true;
        setCurrentPage((prev) => Math.max(1, prev - 1));
    };

    const goToNextPage = () => {
        shouldScrollOnPageChangeRef.current = true;
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
    };

    const clearCatalogFilters = () => {
        setSelectedCategoryId(null);
        setSelectedBrandId(null);
        setSelectedPriceMin('');
        setSelectedPriceMax('');
        setSortKey('default');
        setSelectedCharacteristics({});
        setPageSize(DEFAULT_PAGE_SIZE);
        setCurrentPage(1);
    };

    const applyPriceRange = (min, max) => {
        const minBound = normalizeBound(priceBounds?.min, 'min');
        const maxBound = normalizeBound(priceBounds?.max, 'max');

        let minValue = min ? Number(min) : null;
        let maxValue = max ? Number(max) : null;

        if (minValue != null && Number.isFinite(minValue)) {
            minValue = Math.max(0, Math.floor(minValue));
            if (minBound != null) minValue = Math.max(minValue, minBound);
            if (maxBound != null) minValue = Math.min(minValue, maxBound);
        } else {
            minValue = null;
        }

        if (maxValue != null && Number.isFinite(maxValue)) {
            maxValue = Math.max(0, Math.floor(maxValue));
            if (maxBound != null) maxValue = Math.min(maxValue, maxBound);
            if (minBound != null) maxValue = Math.max(maxValue, minBound);
        } else {
            maxValue = null;
        }

        if (minValue != null && maxValue != null && minValue > maxValue) {
            maxValue = minValue;
        }

        setSelectedPriceMin(minValue != null ? String(minValue) : '');
        setSelectedPriceMax(maxValue != null ? String(maxValue) : '');
        setCurrentPage(1);
    };

    const resetPriceRange = () => {
        setSelectedPriceMin('');
        setSelectedPriceMax('');
        setCurrentPage(1);
    };

    const toggleCharacteristicValue = (name, value) => {
        setSelectedCharacteristics((prev) => {
            const currentValues = prev[name] || [];
            const exists = currentValues.includes(value);
            const nextValues = exists
                ? currentValues.filter((item) => item !== value)
                : [...currentValues, value];

            if (!nextValues.length) {
                const copy = {...prev};
                delete copy[name];
                return copy;
            }

            return {
                ...prev,
                [name]: nextValues,
            };
        });
        setCurrentPage(1);
    };

    const skeletonCount = useMemo(() => {
        if (isRefetching) {
            return Math.max(pagedProducts.length, SKELETON_COUNT);
        }
        return SKELETON_COUNT;
    }, [isRefetching, pagedProducts.length]);

    const skeletonItems = useMemo(
        () => Array.from({length: skeletonCount}, (_, index) => `skeleton-${index}`),
        [skeletonCount],
    );

    useEffect(() => {
        if (!shouldScrollOnPageChangeRef.current) return;
        window.scrollTo({top: 0, left: 0, behavior: 'smooth'});
        shouldScrollOnPageChangeRef.current = false;
    }, [currentPage]);

    return (
        <div className={styles.catalogWrapper}>
            <div className={styles.headerRow}>
                <div className={styles.catalogTitleBlock}>
                    <h1 className={styles.catalogTitle}>Каталог товаров</h1>
                    <p className={styles.catalogSub}>
                        {loading || isRefetching
                            ? 'Обновляем каталог по выбранным параметрам'
                            : `${sortedProducts.length} ${sortedProducts.length === 1 ? 'товар' : sortedProducts.length >= 2 && sortedProducts.length <= 4 ? 'товара' : 'товаров'} в выдаче`}
                    </p>
                </div>

                <div className={styles.toolbar}>
                    <div className={styles.chips}>
                        <div className={styles.chip}>{selectedCategoryPath}</div>
                        {selectedBrandName ? <div className={styles.chip}>Бренд: {selectedBrandName}</div> : null}
                        {search ? <div className={styles.chip}>Поиск: {search}</div> : null}
                        {selectedPriceMin || selectedPriceMax ? (
                            <div className={styles.chip}>
                                Цена: {selectedPriceMin || '0'} - {selectedPriceMax || '∞'} ₽
                            </div>
                        ) : null}
                        {selectedCharacteristicCount > 0 ? (
                            <div className={styles.chip}>Характеристики: {selectedCharacteristicCount}</div>
                        ) : null}
                        {sortKey !== 'default' ? (
                            <div className={styles.chip}>
                                {SORT_OPTIONS.find((option) => option.value === sortKey)?.label || 'Сортировка'}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className={styles.quickCategories}>
                <button
                    type="button"
                    className={`${styles.quickCategoryBtn} ${selectedCategoryId == null ? styles.quickCategoryBtnActive : ''}`}
                    onClick={() => handleSelectCategory(null)}
                >
                    Все товары
                </button>
                {rootCategoryQuickList.map((category) => (
                    <button
                        type="button"
                        key={category.id}
                        className={`${styles.quickCategoryBtn} ${selectedCategoryId === category.id ? styles.quickCategoryBtnActive : ''}`}
                        onClick={() => handleSelectCategory(category.id)}
                    >
                        {category.name}
                    </button>
                ))}
            </div>

            <div className={styles.topRow}>
                <div className={styles.sidebarBlock}>
                    <Sidebar
                        categoryTree={categoryTree}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={handleSelectCategory}
                        priceMin={selectedPriceMin}
                        priceMax={selectedPriceMax}
                        priceBounds={priceBounds}
                        onApplyPrice={applyPriceRange}
                        onResetPrice={resetPriceRange}
                        sortValue={sortKey}
                        sortOptions={SORT_OPTIONS}
                        onSelectSort={handleSelectSort}
                        brands={visibleBrandOptions}
                        selectedBrandId={selectedBrandId}
                        onSelectBrand={handleSelectBrand}
                        characteristics={characteristicFacets}
                        selectedCharacteristics={selectedCharacteristics}
                        onToggleCharacteristic={toggleCharacteristicValue}
                        onClearFilters={clearCatalogFilters}
                        hasActiveFilters={hasActiveFilters}
                    />
                </div>

                <div className={styles.mainBlock}>
                    <div className={styles.gridFrame}>
                        {(loading || isRefetching || pagedProducts.length > 0) ? (
                            <div className={styles.productsGrid}>
                                {(loading || isRefetching) && skeletonItems.map((item) => (
                                    <div className={styles.skeletonCard} key={item} aria-hidden="true">
                                        <div className={styles.skeletonImg}/>
                                        <div className={styles.skeletonLine}/>
                                        <div className={styles.skeletonLineShort}/>
                                        <div className={styles.skeletonBtn}/>
                                    </div>
                                ))}

                                {!loading && !isRefetching && !error && pagedProducts.map((product) => (
                                    <ProductCard product={product} key={product.id}/>
                                ))}
                            </div>
                        ) : null}

                        {!loading && error && sortedProducts.length === 0 ? (
                            <div className={styles.emptyCard}>
                                <span className={styles.notFound}>{error}</span>
                                <button
                                    type="button"
                                    className={styles.emptyActionBtn}
                                    onClick={() => setRequestVersion((prev) => prev + 1)}
                                >
                                    Повторить загрузку
                                </button>
                            </div>
                        ) : null}

                        {!error && loading ? (
                            <div className={styles.statusCard}>
                                <span className={styles.notFound}>Загрузка товаров...</span>
                            </div>
                        ) : null}

                        {!error && !loading && sortedProducts.length === 0 ? (
                            <div className={styles.emptyCard}>
                                <span className={styles.notFound}>Нет товаров по выбранным фильтрам</span>
                                <div className={styles.emptyHelp}>
                                    Попробуйте снять часть фильтров или переключиться на раздел «Все товары».
                                </div>
                                <button
                                    type="button"
                                    className={styles.emptyActionBtn}
                                    onClick={clearCatalogFilters}
                                >
                                    Сбросить фильтры
                                </button>
                            </div>
                        ) : null}
                    </div>

                    {!loading && !error && sortedProducts.length > 0 ? (
                        <div className={styles.paginationBar}>
                            <div className={styles.paginationLeft}>
                                <label className={styles.controlLabel}>
                                    Товаров на странице
                                    <select
                                        className={styles.controlSelect}
                                        value={pageSize}
                                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                    >
                                        {PAGE_SIZE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className={styles.paginationLabel}>{pageRangeLabel}</div>
                            </div>

                            <div className={styles.paginationRight}>
                                {hasActiveFilters ? (
                                    <button
                                        type="button"
                                        className={styles.clearBtn}
                                        onClick={clearCatalogFilters}
                                    >
                                        Сбросить фильтры
                                    </button>
                                ) : null}

                                <div className={styles.paginationControls}>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        disabled={currentPage <= 1}
                                        onClick={goToPrevPage}
                                    >
                                        Назад
                                    </button>
                                    <div className={styles.pageIndicator}>Страница {currentPage} из {totalPages}</div>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        disabled={currentPage >= totalPages}
                                        onClick={goToNextPage}
                                    >
                                        Вперёд
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
