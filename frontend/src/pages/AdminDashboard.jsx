import {useCallback, useEffect, useMemo, useState} from 'react';
import {FaChevronDown} from 'react-icons/fa';
import {useAuth} from '../store/authContext';
import styles from '../styles/AdminDashboard.module.css';

const EMPTY_FORM = {
    name: '',
    slug: '',
    description: '',
    sku: '',
    category_id: '',
    brand_id: '',
    price: '',
    stock: '',
    is_active: true,
    images_text: '',
};

const EMPTY_CATEGORY_FORM = {
    name: '',
    slug: '',
    parent_id: '',
    is_active: true,
};

const EMPTY_BRAND_FORM = {
    name: '',
    slug: '',
    is_active: true,
};

const EMPTY_IMPORT_FORM = {
    file: null,
    stock_default: '0',
    is_active: true,
};

async function readJsonSafe(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function normalizeImageLines(text) {
    return String(text || '')
        .split('\n')
        .map((line, index) => ({image_url: line.trim(), sort_order: index}))
        .filter((item) => item.image_url);
}

function sanitizeIntegerInput(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

function normalizePriceForForm(value) {
    if (value === null || value === undefined || value === '') return '';
    const raw = String(value).trim();
    if (!raw) return '';
    const [rubles = ''] = raw.split('.');
    return sanitizeIntegerInput(rubles);
}

function controlClass(styles, invalid = false, extra = '') {
    return [styles.control, invalid ? styles.controlInvalid : '', extra].filter(Boolean).join(' ');
}

function SelectField({className, children, ...props}) {
    return (
        <div className={styles.selectWrap}>
            <select className={className} {...props}>
                {children}
            </select>
            <span className={styles.selectArrow} aria-hidden="true">
                <FaChevronDown />
            </span>
        </div>
    );
}

function focusFirstInvalidControl(formEl) {
    if (!formEl) return;
    window.requestAnimationFrame(() => {
        const firstInvalid = formEl.querySelector('[data-invalid="true"]');
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
            firstInvalid.focus();
            if (typeof firstInvalid.scrollIntoView === 'function') {
                firstInvalid.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
        }
    });
}

function formatMoney(v) {
    return Number(v || 0).toLocaleString('ru-RU');
}

function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getProductPreview(product) {
    if (!Array.isArray(product?.images) || product.images.length === 0) return '';
    return product.images[0]?.image_url || '';
}

export default function AdminDashboard() {
    const {authFetch, permissions} = useAuth();

    const [loadingMeta, setLoadingMeta] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [mode, setMode] = useState('product');
    const [productPanelMode, setProductPanelMode] = useState('manual');

    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({count: 0, page: 1, page_size: 10, total_pages: 1});

    const [form, setForm] = useState(EMPTY_FORM);
    const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM);
    const [brandForm, setBrandForm] = useState(EMPTY_BRAND_FORM);
    const [importForm, setImportForm] = useState(EMPTY_IMPORT_FORM);
    const [importReport, setImportReport] = useState(null);
    const [editingProductId, setEditingProductId] = useState(null);
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [editingBrandId, setEditingBrandId] = useState(null);
    const [productSubmitAttempted, setProductSubmitAttempted] = useState(false);
    const [categorySubmitAttempted, setCategorySubmitAttempted] = useState(false);
    const [brandSubmitAttempted, setBrandSubmitAttempted] = useState(false);
    const [importSubmitAttempted, setImportSubmitAttempted] = useState(false);

    const canUseAdmin = !!permissions?.is_superuser || !!permissions?.is_staff;

    const loadMeta = useCallback(async () => {
        setLoadingMeta(true);
        try {
            const [categoriesRes, brandsRes] = await Promise.all([
                authFetch('/api/catalog/admin/categories/', {method: 'GET'}),
                authFetch('/api/catalog/admin/brands/', {method: 'GET'}),
            ]);

            const [categoriesData, brandsData] = await Promise.all([
                readJsonSafe(categoriesRes),
                readJsonSafe(brandsRes),
            ]);

            if (!categoriesRes.ok) {
                throw new Error(categoriesData?.detail || 'Не удалось загрузить категории');
            }
            if (!brandsRes.ok) {
                throw new Error(brandsData?.detail || 'Не удалось загрузить бренды');
            }

            setCategories(Array.isArray(categoriesData?.results) ? categoriesData.results : []);
            setBrands(Array.isArray(brandsData?.results) ? brandsData.results : []);
        } catch (e) {
            setError(e?.message || 'Ошибка загрузки данных');
        } finally {
            setLoadingMeta(false);
        }
    }, [authFetch]);

    const loadProducts = useCallback(async (searchValue = '', pageValue = 1) => {
        setLoadingProducts(true);
        try {
            const qs = new URLSearchParams();
            if (searchValue.trim()) qs.set('search', searchValue.trim());
            qs.set('page', String(pageValue));
            const suffix = qs.toString() ? `?${qs.toString()}` : '';
            const res = await authFetch(`/api/catalog/admin/products/${suffix}`, {method: 'GET'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось загрузить товары');
            }
            setProducts(Array.isArray(data?.results) ? data.results : []);
            setPagination({
                count: Number(data?.count || 0),
                page: Number(data?.page || pageValue || 1),
                page_size: Number(data?.page_size || 10),
                total_pages: Number(data?.total_pages || 1),
            });
            setPage(Number(data?.page || pageValue || 1));
        } catch (e) {
            setError(e?.message || 'Ошибка загрузки товаров');
            setProducts([]);
            setPagination({count: 0, page: 1, page_size: 10, total_pages: 1});
        } finally {
            setLoadingProducts(false);
        }
    }, [authFetch]);

    useEffect(() => {
        if (!canUseAdmin) return;
        loadMeta();
        loadProducts('', 1);
    }, [canUseAdmin, loadMeta, loadProducts]);

    const categoryOptions = useMemo(() => {
        const categoryMap = new Map(categories.map((category) => [category.id, category]));
        return categories.map((category) => {
            const parent = category.parent ? categoryMap.get(category.parent) : null;
            return {
                value: String(category.id),
                label: parent ? `${parent.name} / ${category.name}` : category.name,
            };
        });
    }, [categories]);

    const handleChange = (field, value) => setForm((prev) => ({...prev, [field]: value}));
    const handleCategoryChange = (field, value) => setCategoryForm((prev) => ({...prev, [field]: value}));
    const handleBrandChange = (field, value) => setBrandForm((prev) => ({...prev, [field]: value}));
    const handleImportChange = (field, value) => setImportForm((prev) => ({...prev, [field]: value}));

    const resetProductForm = () => {
        setForm(EMPTY_FORM);
        setEditingProductId(null);
        setProductSubmitAttempted(false);
    };

    const resetCategoryForm = () => {
        setCategoryForm(EMPTY_CATEGORY_FORM);
        setEditingCategoryId(null);
        setCategorySubmitAttempted(false);
    };

    const resetBrandForm = () => {
        setBrandForm(EMPTY_BRAND_FORM);
        setEditingBrandId(null);
        setBrandSubmitAttempted(false);
    };

    const productErrors = useMemo(() => ({
        name: !form.name.trim(),
        category_id: !form.category_id,
        price: !form.price,
        stock: !form.stock,
    }), [form]);

    const categoryErrors = useMemo(() => ({
        name: !categoryForm.name.trim(),
    }), [categoryForm]);

    const brandErrors = useMemo(() => ({
        name: !brandForm.name.trim(),
    }), [brandForm]);

    const importErrors = useMemo(() => ({
        file: !importForm.file,
    }), [importForm]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setProductSubmitAttempted(true);
        setError('');
        setSuccess('');
        setSaving(true);

        if (Object.values(productErrors).some(Boolean)) {
            setError('Заполните обязательные поля товара');
            setSaving(false);
            focusFirstInvalidControl(e.currentTarget);
            return;
        }

        try {
            const payload = {
                name: form.name.trim(),
                slug: form.slug.trim(),
                description: form.description.trim(),
                sku: form.sku.trim() || null,
                category_id: Number(form.category_id),
                brand_id: form.brand_id ? Number(form.brand_id) : null,
                price: form.price,
                stock: Number(form.stock),
                is_active: !!form.is_active,
                images: normalizeImageLines(form.images_text),
            };

            const isEditing = !!editingProductId;
            const res = await authFetch(
                isEditing ? `/api/catalog/admin/products/${editingProductId}/` : '/api/catalog/admin/products/',
                {
                    method: isEditing ? 'PATCH' : 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload),
                }
            );
            const data = await readJsonSafe(res);

            if (!res.ok) {
                const detail = data?.detail || Object.values(data || {}).flat().join(' ') || 'Не удалось создать товар';
                throw new Error(detail);
            }

            resetProductForm();
            setSuccess(isEditing ? `Товар "${data.name}" обновлен` : `Товар "${data.name}" добавлен`);
            await loadProducts(search, page);
        } catch (e) {
            setError(e?.message || 'Ошибка создания товара');
        } finally {
            setSaving(false);
        }
    };

    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        setCategorySubmitAttempted(true);
        setError('');
        setSuccess('');
        setSaving(true);

        if (Object.values(categoryErrors).some(Boolean)) {
            setError('Заполните обязательные поля категории');
            setSaving(false);
            focusFirstInvalidControl(e.currentTarget);
            return;
        }

        try {
            const payload = {
                name: categoryForm.name.trim(),
                slug: categoryForm.slug.trim(),
                parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
                is_active: !!categoryForm.is_active,
            };

            const isEditing = !!editingCategoryId;
            const res = await authFetch(isEditing ? `/api/catalog/admin/categories/${editingCategoryId}/` : '/api/catalog/admin/categories/', {
                method: isEditing ? 'PATCH' : 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });
            const data = await readJsonSafe(res);
            if (!res.ok) {
                const detail = data?.detail || Object.values(data || {}).flat().join(' ') || 'Не удалось сохранить категорию';
                throw new Error(detail);
            }
            resetCategoryForm();
            setSuccess(isEditing ? `Категория "${data.name}" обновлена` : `Категория "${data.name}" добавлена`);
            await loadMeta();
        } catch (e) {
            setError(e?.message || 'Ошибка сохранения категории');
        } finally {
            setSaving(false);
        }
    };

    const handleBrandSubmit = async (e) => {
        e.preventDefault();
        setBrandSubmitAttempted(true);
        setError('');
        setSuccess('');
        setSaving(true);

        if (Object.values(brandErrors).some(Boolean)) {
            setError('Заполните обязательные поля бренда');
            setSaving(false);
            focusFirstInvalidControl(e.currentTarget);
            return;
        }

        try {
            const payload = {
                name: brandForm.name.trim(),
                slug: brandForm.slug.trim(),
                is_active: !!brandForm.is_active,
            };

            const isEditing = !!editingBrandId;
            const res = await authFetch(isEditing ? `/api/catalog/admin/brands/${editingBrandId}/` : '/api/catalog/admin/brands/', {
                method: isEditing ? 'PATCH' : 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });
            const data = await readJsonSafe(res);
            if (!res.ok) {
                const detail = data?.detail || Object.values(data || {}).flat().join(' ') || 'Не удалось сохранить бренд';
                throw new Error(detail);
            }
            resetBrandForm();
            setSuccess(isEditing ? `Бренд "${data.name}" обновлен` : `Бренд "${data.name}" добавлен`);
            await loadMeta();
        } catch (e) {
            setError(e?.message || 'Ошибка сохранения бренда');
        } finally {
            setSaving(false);
        }
    };

    const handleImportSubmit = async (e) => {
        e.preventDefault();
        setImportSubmitAttempted(true);
        setError('');
        setSuccess('');
        setImportReport(null);

        if (importErrors.file) {
            setError('Выберите Excel-файл для импорта');
            focusFirstInvalidControl(e.currentTarget);
            return;
        }
        setImporting(true);
        try {
            const payload = new FormData();
            payload.append('file', importForm.file);
            payload.append('stock_default', String(importForm.stock_default || '0'));
            payload.append('is_active', String(!!importForm.is_active));

            const res = await authFetch('/api/catalog/admin/products/import/', {
                method: 'POST',
                body: payload,
            });
            const data = await readJsonSafe(res);

            if (!res.ok) {
                const detail = data?.detail || Object.values(data || {}).flat().join(' ') || 'Не удалось импортировать файл';
                throw new Error(detail);
            }

            setImportReport(data);
            setSuccess('Импорт завершен');
            setImportForm((prev) => ({...prev, file: null}));
            await loadMeta();
            await loadProducts(search, 1);
        } catch (e) {
            setError(e?.message || 'Ошибка импорта');
        } finally {
            setImporting(false);
        }
    };

    const startEditProduct = (product) => {
        setMode('product');
        setProductPanelMode('manual');
        setEditingProductId(product.id);
        setProductSubmitAttempted(false);
        setForm({
            name: product.name || '',
            slug: product.slug || '',
            description: product.description || '',
            sku: product.sku || '',
            category_id: product.category?.id ? String(product.category.id) : '',
            brand_id: product.brand?.id ? String(product.brand.id) : '',
            price: normalizePriceForForm(product.price),
            stock: product.stock ?? '',
            is_active: !!product.is_active,
            images_text: Array.isArray(product.images) ? product.images.map((image) => image.image_url).join('\n') : '',
        });
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    const startEditCategory = (category) => {
        setMode('category');
        setEditingCategoryId(category.id);
        setCategorySubmitAttempted(false);
        setCategoryForm({
            name: category.name || '',
            slug: category.slug || '',
            parent_id: category.parent ? String(category.parent) : '',
            is_active: !!category.is_active,
        });
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    const startEditBrand = (brand) => {
        setMode('brand');
        setEditingBrandId(brand.id);
        setBrandSubmitAttempted(false);
        setBrandForm({
            name: brand.name || '',
            slug: brand.slug || '',
            is_active: !!brand.is_active,
        });
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    if (!canUseAdmin) {
        return <div className={styles.denied}>Доступ к панели товаров есть только у администратора.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.head}>
                    <div>
                        <h1 className={styles.title}>Товары</h1>
                        <div className={styles.sub}>Импорт, создание и редактирование товарного каталога</div>
                    </div>
                </div>

                {error ? <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div> : null}
                {success ? <div className={`${styles.notice} ${styles.noticeSuccess}`}>{success}</div> : null}

                <div className={styles.modeTabs}>
                    <button
                        type="button"
                        className={`${styles.modeTab} ${mode === 'product' ? styles.modeTabActive : ''}`}
                        onClick={() => setMode('product')}
                    >
                        Товары
                    </button>
                    <button
                        type="button"
                        className={`${styles.modeTab} ${mode === 'category' ? styles.modeTabActive : ''}`}
                        onClick={() => setMode('category')}
                    >
                        Категории
                    </button>
                    <button
                        type="button"
                        className={`${styles.modeTab} ${mode === 'brand' ? styles.modeTabActive : ''}`}
                        onClick={() => setMode('brand')}
                    >
                        Бренды
                    </button>
                </div>

                <div className={styles.layout}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div className={styles.panelHeadMain}>
                                <div className={styles.panelTitle}>
                                    {mode === 'product'
                                        ? 'Управление товарами'
                                        : mode === 'category'
                                            ? (editingCategoryId ? 'Редактирование категории' : 'Новая категория')
                                            : (editingBrandId ? 'Редактирование бренда' : 'Новый бренд')}
                                </div>
                                {mode === 'product' ? (
                                    <div className={styles.panelHint}>Список товаров. Отсюда можно перейти к редактированию.</div>
                                ) : mode === 'category' ? (
                                    <div className={styles.panelHint}>Можно создать корневую категорию или вложить ее в существующую</div>
                                ) : (
                                    <div className={styles.panelHint}>Бренды доступны в карточке товара и при импорте из Excel</div>
                                )}
                                {mode === 'product' && productPanelMode === 'manual' && editingProductId ? (
                                    <div className={styles.editingCompact}>
                                        <span className={styles.editingCompactLabel}>Редактируется:</span>
                                        <span className={styles.editingCompactValue}>{form.name || `Товар #${editingProductId}`}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {mode === 'product' ? (
                            <div className={styles.stack}>
                                <div className={styles.innerTabs}>
                                    <button
                                        type="button"
                                        className={`${styles.innerTab} ${productPanelMode === 'manual' ? styles.innerTabActive : ''}`}
                                        onClick={() => setProductPanelMode('manual')}
                                    >
                                        Ручной режим
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.innerTab} ${productPanelMode === 'import' ? styles.innerTabActive : ''}`}
                                        onClick={() => setProductPanelMode('import')}
                                    >
                                        Импорт из Excel
                                    </button>
                                </div>

                                {productPanelMode === 'import' ? (
                                    <>
                                        <form className={`${styles.form} ${styles.importForm}`} onSubmit={handleImportSubmit} noValidate>
                                            <div className={styles.importHead}>
                                                <div className={styles.importTitle}>Импорт из Excel</div>
                                                <div className={styles.importHint}>
                                                    Поддерживается Ozon-шаблон с автоматическим определением категории по колонке «Тип*».
                                                </div>
                                            </div>

                                            <div className={styles.sectionCard}>
                                                <div className={styles.sectionHead}>
                                                    <div className={styles.sectionTitle}>Файл и параметры</div>
                                                    <div className={styles.sectionHint}>Нужен только файл и общие параметры импортируемых позиций</div>
                                                </div>

                                                <div className={styles.grid}>
                                                    <label className={`${styles.field} ${styles.fieldWide} ${importSubmitAttempted && importErrors.file ? styles.fieldInvalid : ''}`}>
                                                        <span>Excel-файл *</span>
                                                        <input
                                                            type="file"
                                                            accept=".xlsx"
                                                            className={controlClass(styles, importSubmitAttempted && importErrors.file)}
                                                            data-invalid={importSubmitAttempted && importErrors.file ? 'true' : 'false'}
                                                            onChange={(e) => handleImportChange('file', e.target.files?.[0] || null)}
                                                        />
                                                    </label>

                                                    <label className={styles.field}>
                                                        <span>Остаток по умолчанию</span>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            className={controlClass(styles)}
                                                            data-invalid="false"
                                                            value={importForm.stock_default}
                                                            onChange={(e) => handleImportChange('stock_default', sanitizeIntegerInput(e.target.value))}
                                                            placeholder="Например, 10"
                                                        />
                                                    </label>

                                                    <label className={styles.field}>
                                                        <span>Статус</span>
                                                        <div className={styles.checkboxCard}>
                                                            <span className={styles.checkboxCardText}>Активен после импорта</span>
                                                            <input
                                                                className={styles.checkboxInput}
                                                                type="checkbox"
                                                                checked={importForm.is_active}
                                                                onChange={(e) => handleImportChange('is_active', e.target.checked)}
                                                            />
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className={styles.formActions}>
                                                <button type="submit" className={styles.primaryBtn} disabled={importing || loadingMeta}>
                                                    {importing ? 'Импортирую…' : 'Загрузить товары из файла'}
                                                </button>
                                            </div>
                                        </form>

                                        {importReport ? (
                                            <div className={styles.importReport}>
                                                <div className={styles.importSummary}>
                                                    <div className={styles.metricCard}>
                                                        <div className={styles.metricLabel}>Создано</div>
                                                        <div className={styles.metricValue}>{importReport.summary?.created || 0}</div>
                                                    </div>
                                                    <div className={styles.metricCard}>
                                                        <div className={styles.metricLabel}>Пропущено</div>
                                                        <div className={styles.metricValue}>{importReport.summary?.skipped || 0}</div>
                                                    </div>
                                                    <div className={styles.metricCard}>
                                                        <div className={styles.metricLabel}>Ошибки</div>
                                                        <div className={styles.metricValue}>{importReport.summary?.errors || 0}</div>
                                                    </div>
                                                    <div className={styles.metricCard}>
                                                        <div className={styles.metricLabel}>Обработано</div>
                                                        <div className={styles.metricValue}>{importReport.summary?.processed || 0}</div>
                                                    </div>
                                                </div>

                                                <div className={styles.reportTable}>
                                                    {(importReport.rows || []).slice(0, 20).map((row) => {
                                                        const badgeClass = row.action === 'created'
                                                            ? styles.reportBadgeCreated
                                                            : row.action === 'skipped'
                                                                ? styles.reportBadgeSkipped
                                                                : styles.reportBadgeError;
                                                        const badgeText = row.action === 'created'
                                                            ? 'Создан'
                                                            : row.action === 'skipped'
                                                                ? 'Пропущен'
                                                                : 'Ошибка';
                                                        return (
                                                            <div key={`${row.row_number}-${row.sku}-${row.action}`} className={styles.reportRow}>
                                                                <div className={styles.reportMain}>
                                                                    <div className={styles.reportTitle}>
                                                                        Строка {row.row_number} · {row.sku || 'без артикула'} · {row.category_name || 'без категории'}
                                                                    </div>
                                                                    <div className={styles.reportText}>{row.name || 'Без названия'}</div>
                                                                </div>
                                                                <div className={styles.reportSide}>
                                                                    <div className={`${styles.reportBadge} ${badgeClass}`}>{badgeText}</div>
                                                                    <div className={styles.reportText}>{row.message}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <form className={styles.form} onSubmit={handleSubmit} noValidate>
                                        <div className={styles.sectionCard}>
                                            <div className={styles.sectionHead}>
                                                <div className={styles.sectionTitle}>Основное</div>
                                                <div className={styles.sectionHint}>Название, идентификаторы и размещение товара в каталоге</div>
                                            </div>

                                            <div className={styles.grid}>
                                                <label className={`${styles.field} ${productSubmitAttempted && productErrors.name ? styles.fieldInvalid : ''}`}>
                                                    <span>Название *</span>
                                                    <input className={controlClass(styles, productSubmitAttempted && productErrors.name)} data-invalid={productSubmitAttempted && productErrors.name ? 'true' : 'false'} value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Например, Очиститель салона" required/>
                                                </label>

                                                <label className={styles.field}>
                                                    <span>Slug</span>
                                                    <input className={controlClass(styles)} data-invalid="false" value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} placeholder="Можно не заполнять"/>
                                                </label>

                                                <label className={styles.field}>
                                                    <span>SKU</span>
                                                    <input className={controlClass(styles)} data-invalid="false" value={form.sku} onChange={(e) => handleChange('sku', e.target.value)} placeholder="Например, AB-12345"/>
                                                </label>

                                                <label className={`${styles.field} ${productSubmitAttempted && productErrors.category_id ? styles.fieldInvalid : ''}`}>
                                                    <span>Категория *</span>
                                                    <SelectField
                                                        className={controlClass(styles, productSubmitAttempted && productErrors.category_id, styles.selectControl)}
                                                        data-invalid={productSubmitAttempted && productErrors.category_id ? 'true' : 'false'}
                                                        value={form.category_id}
                                                        onChange={(e) => handleChange('category_id', e.target.value)}
                                                        required
                                                        disabled={loadingMeta}
                                                    >
                                                        <option value="" disabled>Выберите категорию</option>
                                                        {categoryOptions.map((item) => (
                                                            <option key={item.value} value={item.value}>{item.label}</option>
                                                        ))}
                                                    </SelectField>
                                                </label>

                                                <label className={styles.field}>
                                                    <span>Бренд</span>
                                                    <SelectField
                                                        className={controlClass(styles, false, styles.selectControl)}
                                                        data-invalid="false"
                                                        value={form.brand_id}
                                                        onChange={(e) => handleChange('brand_id', e.target.value)}
                                                        disabled={loadingMeta}
                                                    >
                                                        <option value="">Без бренда</option>
                                                        {brands.map((brand) => (
                                                            <option key={brand.id} value={brand.id}>{brand.name}</option>
                                                        ))}
                                                    </SelectField>
                                                </label>

                                                <label className={styles.field}>
                                                    <span>Статус</span>
                                                    <div className={styles.checkboxCard}>
                                                        <span className={styles.checkboxCardText}>Активен</span>
                                                        <input className={styles.checkboxInput} type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)}/>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        <div className={styles.sectionCard}>
                                            <div className={styles.sectionHead}>
                                                <div className={styles.sectionTitle}>Коммерция</div>
                                                <div className={styles.sectionHint}>Цена и складской остаток</div>
                                            </div>

                                            <div className={styles.grid}>
                                                <label className={`${styles.field} ${productSubmitAttempted && productErrors.price ? styles.fieldInvalid : ''}`}>
                                                    <span>Цена *</span>
                                                    <div className={styles.inputWithSuffix}>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            className={controlClass(styles, productSubmitAttempted && productErrors.price)}
                                                            data-invalid={productSubmitAttempted && productErrors.price ? 'true' : 'false'}
                                                            value={form.price}
                                                            onChange={(e) => handleChange('price', sanitizeIntegerInput(e.target.value))}
                                                            placeholder="Например, 2490"
                                                            required
                                                        />
                                                        <span className={styles.inputSuffix}>₽</span>
                                                    </div>
                                                </label>

                                                <label className={`${styles.field} ${productSubmitAttempted && productErrors.stock ? styles.fieldInvalid : ''}`}>
                                                    <span>Остаток *</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        className={controlClass(styles, productSubmitAttempted && productErrors.stock)}
                                                        data-invalid={productSubmitAttempted && productErrors.stock ? 'true' : 'false'}
                                                        value={form.stock}
                                                        onChange={(e) => handleChange('stock', sanitizeIntegerInput(e.target.value))}
                                                        placeholder="Например, 15"
                                                        required
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div className={styles.sectionCard}>
                                            <div className={styles.sectionHead}>
                                                <div className={styles.sectionTitle}>Контент</div>
                                                <div className={styles.sectionHint}>Описание и изображения товара</div>
                                            </div>

                                            <label className={styles.field}>
                                                <span>Описание</span>
                                                <textarea className={controlClass(styles)} data-invalid="false" rows="5" value={form.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Коротко опишите товар, преимущества и применение"/>
                                            </label>

                                            <label className={styles.field}>
                                                <span>Изображения</span>
                                                <textarea
                                                    rows="5"
                                                    className={controlClass(styles)}
                                                    data-invalid="false"
                                                    value={form.images_text}
                                                    onChange={(e) => handleChange('images_text', e.target.value)}
                                                    placeholder={'Вставьте ссылки на изображения, по одному URL на строку'}
                                                />
                                            </label>
                                        </div>

                                        <div className={styles.formActions}>
                                            <button type="submit" className={styles.primaryBtn} disabled={saving || loadingMeta}>
                                                {saving ? 'Сохраняю…' : (editingProductId ? 'Сохранить изменения' : 'Добавить товар')}
                                            </button>
                                            {editingProductId ? (
                                                <button type="button" className={styles.secondaryBtn} onClick={resetProductForm} disabled={saving}>
                                                    Отменить редактирование
                                                </button>
                                            ) : null}
                                        </div>
                                    </form>
                                )}
                            </div>
                        ) : mode === 'category' ? (
                            <form className={styles.form} onSubmit={handleCategorySubmit} noValidate>
                                {editingCategoryId ? (
                                    <div className={styles.editingInline}>
                                        <div className={styles.editingInlineTitle}>Редактируется категория: {categoryForm.name || `#${editingCategoryId}`}</div>
                                        <div className={styles.editingInlineHint}>После сохранения список справа обновится.</div>
                                    </div>
                                ) : null}

                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHead}>
                                        <div className={styles.sectionTitle}>{editingCategoryId ? 'Параметры категории' : 'Новая категория'}</div>
                                        <div className={styles.sectionHint}>Создайте корневую категорию или вложите ее в существующую</div>
                                    </div>

                                    <div className={styles.grid}>
                                        <label className={`${styles.field} ${categorySubmitAttempted && categoryErrors.name ? styles.fieldInvalid : ''}`}>
                                            <span>Название *</span>
                                            <input className={controlClass(styles, categorySubmitAttempted && categoryErrors.name)} data-invalid={categorySubmitAttempted && categoryErrors.name ? 'true' : 'false'} value={categoryForm.name} onChange={(e) => handleCategoryChange('name', e.target.value)} placeholder="Например, Полироли" required/>
                                        </label>

                                        <label className={styles.field}>
                                            <span>Slug</span>
                                            <input className={controlClass(styles)} data-invalid="false" value={categoryForm.slug} onChange={(e) => handleCategoryChange('slug', e.target.value)} placeholder="Можно не заполнять"/>
                                        </label>

                                        <label className={styles.field}>
                                            <span>Родительская категория</span>
                                            <SelectField
                                                className={controlClass(styles, false, styles.selectControl)}
                                                data-invalid="false"
                                                value={categoryForm.parent_id}
                                                onChange={(e) => handleCategoryChange('parent_id', e.target.value)}
                                                disabled={loadingMeta}
                                            >
                                                <option value="">Без родителя</option>
                                                {categoryOptions.map((item) => (
                                                    <option key={item.value} value={item.value}>{item.label}</option>
                                                ))}
                                            </SelectField>
                                        </label>

                                        <label className={styles.field}>
                                            <span>Статус</span>
                                            <div className={styles.checkboxCard}>
                                                <span className={styles.checkboxCardText}>Активна</span>
                                                <input className={styles.checkboxInput} type="checkbox" checked={categoryForm.is_active} onChange={(e) => handleCategoryChange('is_active', e.target.checked)}/>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className={styles.formActions}>
                                    <button type="submit" className={styles.primaryBtn} disabled={saving || loadingMeta}>
                                        {saving ? 'Сохраняю…' : (editingCategoryId ? 'Сохранить изменения' : 'Добавить категорию')}
                                    </button>
                                    {editingCategoryId ? (
                                        <button type="button" className={styles.secondaryBtn} onClick={resetCategoryForm} disabled={saving}>
                                            Отменить редактирование
                                        </button>
                                    ) : null}
                                </div>
                            </form>
                        ) : (
                            <form className={styles.form} onSubmit={handleBrandSubmit} noValidate>
                                {editingBrandId ? (
                                    <div className={styles.editingInline}>
                                        <div className={styles.editingInlineTitle}>Редактируется бренд: {brandForm.name || `#${editingBrandId}`}</div>
                                        <div className={styles.editingInlineHint}>После сохранения список справа обновится.</div>
                                    </div>
                                ) : null}

                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHead}>
                                        <div className={styles.sectionTitle}>{editingBrandId ? 'Параметры бренда' : 'Новый бренд'}</div>
                                        <div className={styles.sectionHint}>Бренд нужен для товара, поиска и импорта</div>
                                    </div>

                                    <div className={styles.grid}>
                                        <label className={`${styles.field} ${brandSubmitAttempted && brandErrors.name ? styles.fieldInvalid : ''}`}>
                                            <span>Название *</span>
                                            <input className={controlClass(styles, brandSubmitAttempted && brandErrors.name)} data-invalid={brandSubmitAttempted && brandErrors.name ? 'true' : 'false'} value={brandForm.name} onChange={(e) => handleBrandChange('name', e.target.value)} placeholder="Например, Koch Chemie" required/>
                                        </label>

                                        <label className={styles.field}>
                                            <span>Slug</span>
                                            <input className={controlClass(styles)} data-invalid="false" value={brandForm.slug} onChange={(e) => handleBrandChange('slug', e.target.value)} placeholder="Можно не заполнять"/>
                                        </label>

                                        <label className={styles.field}>
                                            <span>Статус</span>
                                            <div className={styles.checkboxCard}>
                                                <span className={styles.checkboxCardText}>Активен</span>
                                                <input className={styles.checkboxInput} type="checkbox" checked={brandForm.is_active} onChange={(e) => handleBrandChange('is_active', e.target.checked)}/>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className={styles.formActions}>
                                    <button type="submit" className={styles.primaryBtn} disabled={saving || loadingMeta}>
                                        {saving ? 'Сохраняю…' : (editingBrandId ? 'Сохранить изменения' : 'Добавить бренд')}
                                    </button>
                                    {editingBrandId ? (
                                        <button type="button" className={styles.secondaryBtn} onClick={resetBrandForm} disabled={saving}>
                                            Отменить редактирование
                                        </button>
                                    ) : null}
                                </div>
                            </form>
                        )}
                    </section>

                    <aside className={styles.side}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div className={styles.panelTitle}>
                                    {mode === 'product' ? 'Товары' : mode === 'category' ? 'Категории' : 'Бренды'}
                                </div>
                                <div className={styles.panelHint}>
                                    {mode === 'product'
                                        ? ''
                                        : mode === 'category'
                                            ? 'Список категорий каталога. Отсюда можно перейти к редактированию.'
                                            : 'Список брендов каталога. Отсюда можно перейти к редактированию.'}
                                </div>
                            </div>

                            {mode === 'product' && editingProductId ? (
                                <div className={styles.editingBanner}>
                                    <div className={styles.editingTitle}>Сейчас редактируется товар #{editingProductId}</div>
                                    <button type="button" className={styles.secondaryBtn} onClick={resetProductForm}>
                                        Сбросить форму
                                    </button>
                                </div>
                            ) : null}

                            {mode === 'product' ? (
                                <>
                                    <div className={styles.searchRow}>
                                        <input
                                            className={styles.searchInput}
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Поиск по названию или SKU"
                                        />
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => loadProducts(search, 1)}
                                            disabled={loadingProducts}
                                        >
                                            {loadingProducts ? 'Ищу…' : 'Найти'}
                                        </button>
                                    </div>

                                    <div className={styles.productList}>
                                        {products.map((product) => (
                                            <div
                                                key={product.id}
                                                className={`${styles.productRow} ${editingProductId === product.id ? styles.productRowActive : ''}`}
                                            >
                                                <div className={styles.productThumbWrap}>
                                                    {getProductPreview(product) ? (
                                                        <img
                                                            src={getProductPreview(product)}
                                                            alt={product.name}
                                                            className={styles.productThumb}
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className={styles.productThumbPlaceholder}>Нет фото</div>
                                                    )}
                                                </div>
                                                <div className={styles.productMain}>
                                                    <div className={styles.productName}>{product.name}</div>
                                                    <div className={styles.productMeta}>
                                                        #{product.id} · {product.category?.name || 'Без категории'} · {product.is_active ? 'Активен' : 'Скрыт'}
                                                    </div>
                                                    <div className={styles.productMeta}>
                                                        SKU: {product.sku || '—'} · {product.brand?.name || 'Без бренда'} · Остаток: {product.stock}
                                                    </div>
                                                </div>
                                                <div className={styles.productSide}>
                                                    <div className={styles.productPrice}>{formatMoney(product.price)} ₽</div>
                                                    <div className={styles.productMeta}>{formatDateTime(product.created_at)}</div>
                                                    <button
                                                        type="button"
                                                        className={styles.secondaryBtn}
                                                        onClick={() => startEditProduct(product)}
                                                    >
                                                        Редактировать
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {!loadingProducts && products.length === 0 ? (
                                            <div className={styles.empty}>Товары пока не найдены</div>
                                        ) : null}
                                    </div>

                                    <div className={styles.pagination}>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => loadProducts(search, page - 1)}
                                            disabled={loadingProducts || page <= 1}
                                        >
                                            Назад
                                        </button>
                                        <div className={styles.paginationPages}>
                                            {Array.from({length: pagination.total_pages}, (_, index) => index + 1).map((pageNumber) => (
                                                <button
                                                    key={pageNumber}
                                                    type="button"
                                                    className={`${styles.pageBtn} ${pageNumber === page ? styles.pageBtnActive : ''}`}
                                                    onClick={() => loadProducts(search, pageNumber)}
                                                    disabled={loadingProducts}
                                                >
                                                    {pageNumber}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => loadProducts(search, page + 1)}
                                            disabled={loadingProducts || page >= pagination.total_pages}
                                        >
                                            Вперед
                                        </button>
                                    </div>
                                </>
                            ) : mode === 'category' ? (
                                <div className={styles.entityList}>
                                    {categories.map((category) => {
                                        const parent = categories.find((item) => item.id === category.parent);
                                        return (
                                            <div
                                                key={category.id}
                                                className={`${styles.entityRow} ${editingCategoryId === category.id ? styles.productRowActive : ''}`}
                                            >
                                                <div className={styles.productMain}>
                                                    <div className={styles.productName}>{category.name}</div>
                                                    <div className={styles.productMeta}>
                                                        #{category.id} · {parent ? `${parent.name} / вложенная` : 'Корневая категория'}
                                                    </div>
                                                    <div className={styles.productMeta}>
                                                        {category.slug} · {category.is_active ? 'Активна' : 'Скрыта'}
                                                    </div>
                                                </div>
                                                <div className={styles.productSide}>
                                                    <button
                                                        type="button"
                                                        className={styles.secondaryBtn}
                                                        onClick={() => startEditCategory(category)}
                                                    >
                                                        Редактировать
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {categories.length === 0 ? (
                                        <div className={styles.empty}>Категории пока не найдены</div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className={styles.entityList}>
                                    {brands.map((brand) => (
                                        <div
                                            key={brand.id}
                                            className={`${styles.entityRow} ${editingBrandId === brand.id ? styles.productRowActive : ''}`}
                                        >
                                            <div className={styles.productMain}>
                                                <div className={styles.productName}>{brand.name}</div>
                                                <div className={styles.productMeta}>#{brand.id} · {brand.slug}</div>
                                                <div className={styles.productMeta}>{brand.is_active ? 'Активен' : 'Скрыт'}</div>
                                            </div>
                                            <div className={styles.productSide}>
                                                <button
                                                    type="button"
                                                    className={styles.secondaryBtn}
                                                    onClick={() => startEditBrand(brand)}
                                                >
                                                    Редактировать
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {brands.length === 0 ? (
                                        <div className={styles.empty}>Бренды пока не найдены</div>
                                    ) : null}
                                </div>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}
