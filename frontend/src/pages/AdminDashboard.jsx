import {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {FaChevronDown} from 'react-icons/fa';
import {useAuth} from '../store/authContext';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/AdminDashboard.module.css';
import productPlaceholder from '../assets/product-placeholder.svg';

const EMPTY_IMAGE_ROW = {image_url: ''};
const EMPTY_CHARACTERISTIC_ROW = {name: '', value: '', is_filterable: true};

function createRowId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function createImageRow(data = EMPTY_IMAGE_ROW) {
    return {
        row_id: createRowId('img'),
        image_url: String(data?.image_url || '').trim(),
    };
}

function createCharacteristicRow(data = EMPTY_CHARACTERISTIC_ROW) {
    return {
        row_id: createRowId('attr'),
        name: String(data?.name || '').trim(),
        value: String(data?.value || '').trim(),
        is_filterable: data?.is_filterable !== false,
    };
}

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
    images: [createImageRow()],
    characteristics: [],
};

function createEmptyProductForm() {
    return {
        ...EMPTY_FORM,
        images: [createImageRow()],
        characteristics: [],
    };
}

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

function normalizeImageRows(rows) {
    const items = Array.isArray(rows) ? rows : [];
    return items
        .map((row, index) => ({
            image_url: String(row?.image_url || '').trim(),
            sort_order: index,
        }))
        .filter((item) => item.image_url);
}

function normalizeCharacteristicRows(rows, canonicalNamesMap = new Map()) {
    const items = Array.isArray(rows) ? rows : [];
    const seen = new Set();
    const normalized = [];

    items.forEach((row, index) => {
        const rawName = String(row?.name || '').trim();
        const rawValue = String(row?.value || '').trim();
        if (!rawName || !rawValue) return;

        const canonicalName = canonicalNamesMap.get(rawName.toLowerCase()) || rawName;
        const name = canonicalName;
        const value = rawValue;
        if (!name || !value) return;

        const key = `${name.toLowerCase()}::${value.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);

        normalized.push({
            name,
            value,
            is_filterable: row?.is_filterable !== false,
            sort_order: index,
        });
    });

    return normalized;
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
    return Number(v || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
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
    if (!Array.isArray(product?.images) || product.images.length === 0) return productPlaceholder;
    return product.images[0]?.image_url || productPlaceholder;
}

const ORDER_STATUS_LABELS = {
    new: 'Новый',
    paid: 'Оплачен',
    shipped: 'В пути',
    completed: 'Доставлен',
    canceled: 'Отменен',
};

function userDisplayName(user) {
    if (!user) return '';
    const fullName = String(user.full_name || '').trim();
    if (fullName) return fullName;
    if (user.username) return user.username;
    return user.email || `ID ${user.id}`;
}

export default function AdminDashboard() {
    const {authFetch, permissions} = useAuth();
    const notify = useNotify();

    const [loadingMeta, setLoadingMeta] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [deletingKey, setDeletingKey] = useState('');

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [mode, setMode] = useState('product');
    const [productPanelMode, setProductPanelMode] = useState('manual');

    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [products, setProducts] = useState([]);
    const [attributeMetaLoading, setAttributeMetaLoading] = useState(false);
    const [attributeMeta, setAttributeMeta] = useState([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({count: 0, page: 1, page_size: 10, total_pages: 1});
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [userActionKey, setUserActionKey] = useState('');
    const [users, setUsers] = useState([]);
    const [userSearch, setUserSearch] = useState('');
    const [usersPage, setUsersPage] = useState(1);
    const [usersPagination, setUsersPagination] = useState({count: 0, page: 1, page_size: 12, total_pages: 1});
    const [usersStatusFilter, setUsersStatusFilter] = useState('all');
    const [usersRoleFilter, setUsersRoleFilter] = useState('all');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [loadingUserOrders, setLoadingUserOrders] = useState(false);
    const [userOrders, setUserOrders] = useState([]);
    const [userOrdersStats, setUserOrdersStats] = useState({
        orders_total: 0,
        spent_total: 0,
        completed_revenue: 0,
        avg_check: 0,
        new_count: 0,
        paid_count: 0,
        shipped_count: 0,
        completed_count: 0,
        canceled_count: 0,
    });

    const [form, setForm] = useState(createEmptyProductForm);
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
    const [openValueSuggestRowId, setOpenValueSuggestRowId] = useState(null);

    const canUseAdmin = !!permissions?.is_superuser || !!permissions?.is_staff;

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    useEffect(() => {
        if (success) notify.success(success);
    }, [success, notify]);

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

    const loadAttributeMeta = useCallback(async (categoryId = '') => {
        if (!canUseAdmin) return;
        setAttributeMetaLoading(true);
        try {
            const qs = new URLSearchParams();
            if (String(categoryId || '').trim()) {
                qs.set('category_id', String(categoryId));
            }
            const suffix = qs.toString() ? `?${qs.toString()}` : '';
            const res = await authFetch(`/api/catalog/admin/attribute-meta/${suffix}`, {method: 'GET'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось загрузить подсказки характеристик');
            }
            setAttributeMeta(Array.isArray(data?.attributes) ? data.attributes : []);
        } catch {
            setAttributeMeta([]);
        } finally {
            setAttributeMetaLoading(false);
        }
    }, [authFetch, canUseAdmin]);

    const loadUsers = useCallback(async ({searchValue, statusValue, roleValue, pageValue} = {}) => {
        setLoadingUsers(true);
        try {
            const finalSearch = (searchValue ?? userSearch).trim();
            const finalStatus = statusValue ?? usersStatusFilter;
            const finalRole = roleValue ?? usersRoleFilter;
            const finalPage = pageValue ?? usersPage;

            const qs = new URLSearchParams();
            if (finalSearch) qs.set('search', finalSearch);
            if (finalStatus && finalStatus !== 'all') qs.set('status', finalStatus);
            if (finalRole && finalRole !== 'all') qs.set('role', finalRole);
            qs.set('page', String(finalPage || 1));

            const res = await authFetch(`/api/users/admin/users/?${qs.toString()}`, {method: 'GET'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось загрузить пользователей');
            }

            const list = Array.isArray(data?.results) ? data.results : [];
            setUsers(list);
            setUsersPagination({
                count: Number(data?.count || 0),
                page: Number(data?.page || finalPage || 1),
                page_size: Number(data?.page_size || 12),
                total_pages: Number(data?.total_pages || 1),
            });
            setUsersPage(Number(data?.page || finalPage || 1));
            setSelectedUserId((prev) => prev || (list[0]?.id ?? null));
        } catch (e) {
            setError(e?.message || 'Ошибка загрузки пользователей');
            setUsers([]);
            setUsersPagination({count: 0, page: 1, page_size: 12, total_pages: 1});
        } finally {
            setLoadingUsers(false);
        }
    }, [authFetch, userSearch, usersStatusFilter, usersRoleFilter, usersPage]);

    useEffect(() => {
        if (!canUseAdmin) return;
        loadMeta();
        loadProducts('', 1);
    }, [canUseAdmin, loadMeta, loadProducts]);

    useEffect(() => {
        if (!canUseAdmin) return;
        if (mode !== 'user') return;
        loadUsers({pageValue: 1});
    }, [canUseAdmin, mode, loadUsers]);

    useEffect(() => {
        if (!canUseAdmin) return;
        if (mode !== 'product' || productPanelMode !== 'manual') return;
        loadAttributeMeta();
    }, [canUseAdmin, mode, productPanelMode, loadAttributeMeta]);

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

    const selectedUser = useMemo(
        () => users.find((item) => item.id === selectedUserId) || null,
        [users, selectedUserId]
    );

    const canonicalAttributeNameMap = useMemo(() => {
        const map = new Map();
        attributeMeta.forEach((item) => {
            const name = String(item?.name || '').trim();
            if (!name) return;
            map.set(name.toLowerCase(), name);
        });
        return map;
    }, [attributeMeta]);

    const attributeValuesMap = useMemo(() => {
        const map = new Map();
        attributeMeta.forEach((item) => {
            const name = String(item?.name || '').trim().toLowerCase();
            if (!name) return;
            const values = Array.isArray(item?.values) ? item.values : [];
            map.set(
                name,
                values
                    .map((entry) => String(entry?.value || '').trim())
                    .filter(Boolean)
            );
        });
        (form.characteristics || []).forEach((item) => {
            const name = String(item?.name || '').trim().toLowerCase();
            const value = String(item?.value || '').trim();
            if (!name || !value) return;
            const current = map.get(name) || [];
            if (!current.includes(value)) {
                map.set(name, [...current, value]);
            }
        });
        return map;
    }, [attributeMeta, form.characteristics]);

    const quickAttributeNames = useMemo(
        () => attributeMeta.slice(0, 8).map((item) => String(item?.name || '').trim()).filter(Boolean),
        [attributeMeta]
    );

    useEffect(() => {
        if (!users.length) {
            setSelectedUserId(null);
            return;
        }
        if (!selectedUserId || !users.some((item) => item.id === selectedUserId)) {
            setSelectedUserId(users[0].id);
        }
    }, [users, selectedUserId]);

    useEffect(() => {
        const loadUserOrders = async () => {
            if (!selectedUserId || mode !== 'user') {
                setUserOrders([]);
                setUserOrdersStats({
                    orders_total: 0,
                    spent_total: 0,
                    completed_revenue: 0,
                    avg_check: 0,
                    new_count: 0,
                    paid_count: 0,
                    shipped_count: 0,
                    completed_count: 0,
                    canceled_count: 0,
                });
                return;
            }
            setLoadingUserOrders(true);
            try {
                const res = await authFetch(`/api/users/admin/users/${selectedUserId}/orders/`, {method: 'GET'});
                const data = await readJsonSafe(res);
                if (!res.ok) {
                    throw new Error(data?.detail || 'Не удалось загрузить заказы пользователя');
                }
                setUserOrdersStats({
                    orders_total: Number(data?.stats?.orders_total || 0),
                    spent_total: Number(data?.stats?.spent_total || 0),
                    completed_revenue: Number(data?.stats?.completed_revenue || 0),
                    avg_check: Number(data?.stats?.avg_check || 0),
                    new_count: Number(data?.stats?.new_count || 0),
                    paid_count: Number(data?.stats?.paid_count || 0),
                    shipped_count: Number(data?.stats?.shipped_count || 0),
                    completed_count: Number(data?.stats?.completed_count || 0),
                    canceled_count: Number(data?.stats?.canceled_count || 0),
                });
                setUserOrders(Array.isArray(data?.results) ? data.results : []);
            } catch (e) {
                setError(e?.message || 'Ошибка загрузки заказов пользователя');
                setUserOrders([]);
                setUserOrdersStats({
                    orders_total: 0,
                    spent_total: 0,
                    completed_revenue: 0,
                    avg_check: 0,
                    new_count: 0,
                    paid_count: 0,
                    shipped_count: 0,
                    completed_count: 0,
                    canceled_count: 0,
                });
            } finally {
                setLoadingUserOrders(false);
            }
        };
        loadUserOrders();
    }, [authFetch, mode, selectedUserId]);

    const handleChange = (field, value) => setForm((prev) => ({...prev, [field]: value}));
    const handleCategoryChange = (field, value) => setCategoryForm((prev) => ({...prev, [field]: value}));
    const handleBrandChange = (field, value) => setBrandForm((prev) => ({...prev, [field]: value}));
    const handleImportChange = (field, value) => setImportForm((prev) => ({...prev, [field]: value}));

    const addImageRow = () => {
        setForm((prev) => ({
            ...prev,
            images: [...(Array.isArray(prev.images) ? prev.images : []), createImageRow()],
        }));
    };

    const updateImageRow = (rowId, value) => {
        setForm((prev) => ({
            ...prev,
            images: (Array.isArray(prev.images) ? prev.images : []).map((row) => (
                row.row_id === rowId
                    ? {...row, image_url: value}
                    : row
            )),
        }));
    };

    const removeImageRow = (rowId) => {
        setForm((prev) => {
            const current = Array.isArray(prev.images) ? prev.images : [];
            const next = current.filter((row) => row.row_id !== rowId);
            return {
                ...prev,
                images: next.length ? next : [createImageRow()],
            };
        });
    };

    const addCharacteristicRow = (name = '') => {
        setForm((prev) => ({
            ...prev,
            characteristics: [...(Array.isArray(prev.characteristics) ? prev.characteristics : []), createCharacteristicRow({name})],
        }));
    };

    const updateCharacteristicRow = (rowId, field, value) => {
        setForm((prev) => ({
            ...prev,
            characteristics: (Array.isArray(prev.characteristics) ? prev.characteristics : []).map((row) => (
                row.row_id === rowId
                    ? {...row, [field]: value}
                    : row
            )),
        }));
    };

    const normalizeCharacteristicName = (rowId) => {
        setForm((prev) => ({
            ...prev,
            characteristics: (Array.isArray(prev.characteristics) ? prev.characteristics : []).map((row) => {
                if (row.row_id !== rowId) return row;
                const rawName = String(row?.name || '').trim();
                if (!rawName) return {...row, name: ''};
                const canonical = canonicalAttributeNameMap.get(rawName.toLowerCase()) || rawName;
                return {...row, name: canonical};
            }),
        }));
    };

    const removeCharacteristicRow = (rowId) => {
        if (openValueSuggestRowId === rowId) {
            setOpenValueSuggestRowId(null);
        }
        setForm((prev) => ({
            ...prev,
            characteristics: (Array.isArray(prev.characteristics) ? prev.characteristics : []).filter((row) => row.row_id !== rowId),
        }));
    };

    const resetProductForm = () => {
        setForm(createEmptyProductForm());
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
                images: normalizeImageRows(form.images),
                characteristics: normalizeCharacteristicRows(form.characteristics, canonicalAttributeNameMap),
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
            await loadAttributeMeta();
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
            images: Array.isArray(product.images) && product.images.length
                ? product.images.map((image) => createImageRow(image))
                : [createImageRow()],
            characteristics: Array.isArray(product.characteristics)
                ? product.characteristics.map((item) => createCharacteristicRow(item))
                : [],
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

    const handleDeleteProduct = async (product) => {
        if (!window.confirm(`Удалить товар «${product.name}»?`)) return;

        setError('');
        setSuccess('');
        const lockKey = `product:${product.id}`;
        setDeletingKey(lockKey);

        try {
            const res = await authFetch(`/api/catalog/admin/products/${product.id}/`, {method: 'DELETE'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось удалить товар');
            }

            if (editingProductId === product.id) {
                resetProductForm();
            }

            const nextPage = products.length === 1 && page > 1 ? page - 1 : page;
            await loadProducts(search, nextPage);
            setSuccess(`Товар «${product.name}» удален`);
        } catch (e) {
            setError(e?.message || 'Ошибка удаления товара');
        } finally {
            setDeletingKey('');
        }
    };

    const handleDeleteCategory = async (category) => {
        if (!window.confirm(`Удалить категорию «${category.name}»?`)) return;

        setError('');
        setSuccess('');
        const lockKey = `category:${category.id}`;
        setDeletingKey(lockKey);

        try {
            const res = await authFetch(`/api/catalog/admin/categories/${category.id}/`, {method: 'DELETE'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось удалить категорию');
            }

            if (editingCategoryId === category.id) {
                resetCategoryForm();
            }

            await loadMeta();
            setSuccess(`Категория «${category.name}» удалена`);
        } catch (e) {
            setError(e?.message || 'Ошибка удаления категории');
        } finally {
            setDeletingKey('');
        }
    };

    const handleDeleteBrand = async (brand) => {
        if (!window.confirm(`Удалить бренд «${brand.name}»?`)) return;

        setError('');
        setSuccess('');
        const lockKey = `brand:${brand.id}`;
        setDeletingKey(lockKey);

        try {
            const res = await authFetch(`/api/catalog/admin/brands/${brand.id}/`, {method: 'DELETE'});
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось удалить бренд');
            }

            if (editingBrandId === brand.id) {
                resetBrandForm();
            }

            await loadMeta();
            setSuccess(`Бренд «${brand.name}» удален`);
        } catch (e) {
            setError(e?.message || 'Ошибка удаления бренда');
        } finally {
            setDeletingKey('');
        }
    };

    const handleUsersSearch = async () => {
        await loadUsers({searchValue: userSearch, pageValue: 1});
    };

    const handleUsersStatusFilterChange = async (value) => {
        setUsersStatusFilter(value);
        await loadUsers({statusValue: value, pageValue: 1});
    };

    const handleUsersRoleFilterChange = async (value) => {
        setUsersRoleFilter(value);
        await loadUsers({roleValue: value, pageValue: 1});
    };

    const handleToggleUserActive = async (user) => {
        if (!user) return;
        const shouldActivate = !user.is_active;
        const lockKey = `user:${user.id}`;
        const confirmText = shouldActivate
            ? `Разблокировать пользователя ${userDisplayName(user)}?`
            : `Заблокировать пользователя ${userDisplayName(user)}?`;

        if (!window.confirm(confirmText)) return;

        setError('');
        setSuccess('');
        setUserActionKey(lockKey);

        try {
            const res = await authFetch(`/api/users/admin/users/${user.id}/status/`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({is_active: shouldActivate}),
            });
            const data = await readJsonSafe(res);
            if (!res.ok) {
                throw new Error(data?.detail || 'Не удалось изменить статус пользователя');
            }

            setUsers((prev) => prev.map((item) => (item.id === user.id ? data : item)));
            setSuccess(
                shouldActivate
                    ? `Пользователь ${userDisplayName(user)} разблокирован`
                    : `Пользователь ${userDisplayName(user)} заблокирован`
            );
        } catch (e) {
            setError(e?.message || 'Ошибка изменения статуса пользователя');
        } finally {
            setUserActionKey('');
        }
    };

    if (!canUseAdmin) {
        return <div className={styles.denied}>Доступ к административной панели есть только у сотрудников.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.head}>
                    <div>
                        <h1 className={styles.title}>Администрирование</h1>
                        <div className={styles.sub}>Товары, категории, бренды и пользователи</div>
                    </div>
                </div>

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
                    <button
                        type="button"
                        className={`${styles.modeTab} ${mode === 'user' ? styles.modeTabActive : ''}`}
                        onClick={() => setMode('user')}
                    >
                        Пользователи
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
                                            : mode === 'brand'
                                                ? (editingBrandId ? 'Редактирование бренда' : 'Новый бренд')
                                                : 'Управление пользователями'}
                                </div>
                                {mode === 'product' ? (
                                    <div className={styles.panelHint}>Список товаров. Отсюда можно перейти к редактированию.</div>
                                ) : mode === 'category' ? (
                                    <div className={styles.panelHint}>Можно создать корневую категорию или вложить ее в существующую</div>
                                ) : mode === 'brand' ? (
                                    <div className={styles.panelHint}>Бренды доступны в карточке товара и при импорте из Excel</div>
                                ) : (
                                    <div className={styles.panelHint}>Блокировка и контроль доступа покупателей и сотрудников</div>
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

                                            <div className={styles.fieldGroup}>
                                                <div className={styles.fieldGroupHead}>
                                                    <div>
                                                        <div className={styles.fieldGroupTitle}>Характеристики</div>
                                                        <div className={styles.fieldGroupHint}>
                                                            Заполните название и значение характеристики. При вводе названия появятся подсказки из уже добавленных товаров.
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className={`${styles.secondaryBtn} ${styles.inlineBtn}`}
                                                        onClick={() => addCharacteristicRow()}
                                                    >
                                                        Добавить
                                                    </button>
                                                </div>

                                                {quickAttributeNames.length > 0 ? (
                                                    <div className={styles.attributeChips}>
                                                        {quickAttributeNames.map((name) => (
                                                            <button
                                                                key={name}
                                                                type="button"
                                                                className={styles.attributeChip}
                                                                onClick={() => addCharacteristicRow(name)}
                                                            >
                                                                {name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {attributeMetaLoading ? (
                                                    <div className={styles.inlineHint}>Загружаю подсказки характеристик…</div>
                                                ) : null}

                                                {form.characteristics.length === 0 ? (
                                                    <div className={styles.inlineHint}>Характеристики не добавлены</div>
                                                ) : (
                                                    <div className={styles.attributeRows}>
                                                        {form.characteristics.map((row) => {
                                                            const valuesOptions = attributeValuesMap.get(String(row?.name || '').trim().toLowerCase()) || [];
                                                            const hasValueOptions = valuesOptions.length > 0;
                                                            return (
                                                                <div key={row.row_id} className={styles.attributeRow}>
                                                                    <input
                                                                        className={controlClass(styles)}
                                                                        data-invalid="false"
                                                                        value={row.name}
                                                                        onChange={(e) => updateCharacteristicRow(row.row_id, 'name', e.target.value)}
                                                                        onBlur={() => normalizeCharacteristicName(row.row_id)}
                                                                        placeholder="Название"
                                                                    />
                                                                    <div className={styles.valueInputWrap}>
                                                                        <input
                                                                            className={controlClass(styles)}
                                                                            data-invalid="false"
                                                                            value={row.value}
                                                                            onChange={(e) => updateCharacteristicRow(row.row_id, 'value', e.target.value)}
                                                                            placeholder="Значение"
                                                                        />
                                                                        {hasValueOptions ? (
                                                                            <button
                                                                                type="button"
                                                                                className={styles.valueSuggestToggle}
                                                                                onClick={() => setOpenValueSuggestRowId((prev) => (
                                                                                    prev === row.row_id ? null : row.row_id
                                                                                ))}
                                                                                aria-label="Показать варианты значения"
                                                                            >
                                                                                <FaChevronDown />
                                                                            </button>
                                                                        ) : null}
                                                                        {hasValueOptions && openValueSuggestRowId === row.row_id ? (
                                                                            <div className={styles.valueSuggestPopover}>
                                                                                {valuesOptions.map((valueItem) => (
                                                                                    <button
                                                                                        key={`${row.row_id}-suggest-${valueItem}`}
                                                                                        type="button"
                                                                                        className={`${styles.valueSuggestBtn} ${row.value === valueItem ? styles.valueSuggestBtnActive : ''}`}
                                                                                        onClick={() => {
                                                                                            updateCharacteristicRow(row.row_id, 'value', valueItem);
                                                                                            setOpenValueSuggestRowId(null);
                                                                                        }}
                                                                                    >
                                                                                        {valueItem}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <label className={styles.attributeToggle}>
                                                                        <input
                                                                            className={styles.checkboxInput}
                                                                            type="checkbox"
                                                                            checked={row.is_filterable !== false}
                                                                            onChange={(e) => updateCharacteristicRow(row.row_id, 'is_filterable', e.target.checked)}
                                                                        />
                                                                        <span>В фильтрах</span>
                                                                    </label>
                                                                <button
                                                                    type="button"
                                                                    className={`${styles.dangerBtn} ${styles.inlineBtn}`}
                                                                    onClick={() => removeCharacteristicRow(row.row_id)}
                                                                >
                                                                    Убрать
                                                                </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                            </div>

                                            <div className={styles.fieldGroup}>
                                                <div className={styles.fieldGroupHead}>
                                                    <div>
                                                        <div className={styles.fieldGroupTitle}>Изображения</div>
                                                        <div className={styles.fieldGroupHint}>
                                                            Добавьте ссылки на фото. Первая картинка будет обложкой товара.
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className={`${styles.secondaryBtn} ${styles.inlineBtn}`}
                                                        onClick={addImageRow}
                                                    >
                                                        Добавить
                                                    </button>
                                                </div>

                                                <div className={styles.imageRows}>
                                                    {(form.images || []).map((row, index) => (
                                                        <div key={row.row_id} className={styles.imageRow}>
                                                            <div className={styles.imagePreview}>
                                                                <img
                                                                    src={String(row?.image_url || '').trim() || productPlaceholder}
                                                                    alt={`Превью ${index + 1}`}
                                                                    onError={(event) => {
                                                                        event.currentTarget.onerror = null;
                                                                        event.currentTarget.src = productPlaceholder;
                                                                    }}
                                                                />
                                                            </div>
                                                            <input
                                                                className={controlClass(styles)}
                                                                data-invalid="false"
                                                                value={row.image_url}
                                                                onChange={(e) => updateImageRow(row.row_id, e.target.value)}
                                                                placeholder="https://example.com/image.jpg"
                                                            />
                                                            <button
                                                                type="button"
                                                                className={`${styles.dangerBtn} ${styles.inlineBtn}`}
                                                                onClick={() => removeImageRow(row.row_id)}
                                                            >
                                                                Убрать
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
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
                        ) : mode === 'brand' ? (
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
                        ) : (
                            <div className={styles.stack}>
                                <div className={styles.userCard}>
                                    <div className={styles.userTitleRow}>
                                        <div className={styles.userTitle}>
                                            {selectedUser ? userDisplayName(selectedUser) : 'Пользователь не выбран'}
                                        </div>
                                        {selectedUser ? (
                                            <div className={styles.userBadges}>
                                                <span
                                                    className={`${styles.userPill} ${
                                                        selectedUser.is_active ? styles.userPillActive : styles.userPillBlocked
                                                    }`}
                                                >
                                                    {selectedUser.is_active ? 'Активен' : 'Заблокирован'}
                                                </span>
                                                <span className={`${styles.userPill} ${styles.userPillRole}`}>
                                                    {selectedUser.is_staff || selectedUser.is_superuser ? 'Сотрудник' : 'Покупатель'}
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>

                                    {selectedUser ? (
                                        <>
                                            <div className={styles.userMetaGrid}>
                                                <div>
                                                    <div className={styles.userMetaLabel}>Логин</div>
                                                    <div className={styles.userMetaValue}>{selectedUser.username || '—'}</div>
                                                </div>
                                                <div>
                                                    <div className={styles.userMetaLabel}>Email</div>
                                                    <div className={styles.userMetaValue}>{selectedUser.email || '—'}</div>
                                                </div>
                                                <div>
                                                    <div className={styles.userMetaLabel}>Заказов</div>
                                                    <div className={styles.userMetaValue}>{selectedUser.orders_count || 0}</div>
                                                </div>
                                                <div>
                                                    <div className={styles.userMetaLabel}>Последний вход</div>
                                                    <div className={styles.userMetaValue}>
                                                        {selectedUser.last_login ? formatDateTime(selectedUser.last_login) : 'Не входил'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className={styles.userMetaLabel}>Дата регистрации</div>
                                                    <div className={styles.userMetaValue}>
                                                        {selectedUser.date_joined ? formatDateTime(selectedUser.date_joined) : '—'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.userOrdersBlock}>
                                                <div className={styles.userStatsGrid}>
                                                    <div className={styles.userStatsCard}>
                                                        <div className={styles.userStatsLabel}>Всего заказов</div>
                                                        <div className={styles.userStatsValue}>{userOrdersStats.orders_total}</div>
                                                    </div>
                                                    <div className={styles.userStatsCard}>
                                                        <div className={styles.userStatsLabel}>Оборот</div>
                                                        <div className={styles.userStatsValue}>{formatMoney(userOrdersStats.spent_total)} ₽</div>
                                                    </div>
                                                    <div className={styles.userStatsCard}>
                                                        <div className={styles.userStatsLabel}>Выкуплено</div>
                                                        <div className={styles.userStatsValue}>{formatMoney(userOrdersStats.completed_revenue)} ₽</div>
                                                    </div>
                                                    <div className={styles.userStatsCard}>
                                                        <div className={styles.userStatsLabel}>Средний чек</div>
                                                        <div className={styles.userStatsValue}>{formatMoney(userOrdersStats.avg_check)} ₽</div>
                                                    </div>
                                                </div>
                                                <div className={styles.userOrdersTitle}>Последние заказы пользователя</div>
                                                {loadingUserOrders ? (
                                                    <div className={styles.userOrdersEmpty}>Загрузка…</div>
                                                ) : userOrders.length === 0 ? (
                                                    <div className={styles.userOrdersEmpty}>Заказов пока нет</div>
                                                ) : (
                                                    <div className={styles.userOrdersList}>
                                                        {userOrders.map((order) => (
                                                            <div className={styles.userOrderRow} key={order.id}>
                                                                <div className={styles.userOrderMain}>
                                                                    <div className={styles.userOrderId}>Заказ #{order.id}</div>
                                                                    <div className={styles.userOrderMeta}>
                                                                        {ORDER_STATUS_LABELS[order.status] || order.status} · {formatDateTime(order.created_at)}
                                                                    </div>
                                                                </div>
                                                                <div className={styles.userOrderSide}>
                                                                    <div className={styles.userOrderTotal}>{formatMoney(order.total_amount)} ₽</div>
                                                                    <div className={styles.userOrderMeta}>{order.items_count || 0} шт.</div>
                                                                    <Link
                                                                        to={`/staff/orders/${order.id}`}
                                                                        state={{backTo: '/admin'}}
                                                                        className={styles.userOrderLink}
                                                                    >
                                                                        Открыть
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.formActions}>
                                                <button
                                                    type="button"
                                                    className={`${selectedUser.is_active ? styles.dangerBtn : styles.primaryBtn}`}
                                                    disabled={userActionKey === `user:${selectedUser.id}`}
                                                    onClick={() => handleToggleUserActive(selectedUser)}
                                                >
                                                    {userActionKey === `user:${selectedUser.id}`
                                                        ? 'Сохраняю…'
                                                        : selectedUser.is_active
                                                            ? 'Заблокировать'
                                                            : 'Разблокировать'}
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className={styles.empty}>Выберите пользователя в списке справа</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    <aside className={styles.side}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div className={styles.panelTitle}>
                                    {mode === 'product'
                                        ? 'Товары'
                                        : mode === 'category'
                                            ? 'Категории'
                                            : mode === 'brand'
                                                ? 'Бренды'
                                                : 'Пользователи'}
                                </div>
                                <div className={styles.panelHint}>
                                    {mode === 'product'
                                        ? ''
                                        : mode === 'category'
                                            ? 'Список категорий каталога. Отсюда можно перейти к редактированию.'
                                            : mode === 'brand'
                                                ? 'Список брендов каталога. Отсюда можно перейти к редактированию.'
                                                : 'Поиск, фильтры и блокировка учетных записей'}
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
                                                    <img
                                                        src={getProductPreview(product)}
                                                        alt={product.name}
                                                        className={styles.productThumb}
                                                        loading="lazy"
                                                        onError={(event) => {
                                                            event.currentTarget.onerror = null;
                                                            event.currentTarget.src = productPlaceholder;
                                                        }}
                                                    />
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
                                                    <div className={styles.rowActions}>
                                                        <button
                                                            type="button"
                                                            className={`${styles.secondaryBtn} ${styles.rowBtn}`}
                                                            onClick={() => startEditProduct(product)}
                                                            disabled={deletingKey === `product:${product.id}`}
                                                        >
                                                            Редактировать
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.dangerBtn} ${styles.rowBtn}`}
                                                            onClick={() => handleDeleteProduct(product)}
                                                            disabled={deletingKey === `product:${product.id}`}
                                                        >
                                                            {deletingKey === `product:${product.id}` ? 'Удаляю…' : 'Удалить'}
                                                        </button>
                                                    </div>
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
                                                    <div className={styles.rowActions}>
                                                        <button
                                                            type="button"
                                                            className={`${styles.secondaryBtn} ${styles.rowBtn}`}
                                                            onClick={() => startEditCategory(category)}
                                                            disabled={deletingKey === `category:${category.id}`}
                                                        >
                                                            Редактировать
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.dangerBtn} ${styles.rowBtn}`}
                                                            onClick={() => handleDeleteCategory(category)}
                                                            disabled={deletingKey === `category:${category.id}`}
                                                        >
                                                            {deletingKey === `category:${category.id}` ? 'Удаляю…' : 'Удалить'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {categories.length === 0 ? (
                                        <div className={styles.empty}>Категории пока не найдены</div>
                                    ) : null}
                                </div>
                            ) : mode === 'brand' ? (
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
                                                <div className={styles.rowActions}>
                                                    <button
                                                        type="button"
                                                        className={`${styles.secondaryBtn} ${styles.rowBtn}`}
                                                        onClick={() => startEditBrand(brand)}
                                                        disabled={deletingKey === `brand:${brand.id}`}
                                                    >
                                                        Редактировать
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.dangerBtn} ${styles.rowBtn}`}
                                                        onClick={() => handleDeleteBrand(brand)}
                                                        disabled={deletingKey === `brand:${brand.id}`}
                                                    >
                                                        {deletingKey === `brand:${brand.id}` ? 'Удаляю…' : 'Удалить'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {brands.length === 0 ? (
                                        <div className={styles.empty}>Бренды пока не найдены</div>
                                    ) : null}
                                </div>
                            ) : (
                                <>
                                    <div className={styles.userFilters}>
                                        <input
                                            className={styles.searchInput}
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            placeholder="Поиск по имени, логину и email"
                                        />
                                        <SelectField
                                            className={`${styles.searchInput} ${styles.selectControl} ${styles.filterSelect}`}
                                            value={usersStatusFilter}
                                            onChange={(e) => handleUsersStatusFilterChange(e.target.value)}
                                        >
                                            <option value="all">Все статусы</option>
                                            <option value="active">Активные</option>
                                            <option value="blocked">Заблокированные</option>
                                        </SelectField>
                                        <SelectField
                                            className={`${styles.searchInput} ${styles.selectControl} ${styles.filterSelect}`}
                                            value={usersRoleFilter}
                                            onChange={(e) => handleUsersRoleFilterChange(e.target.value)}
                                        >
                                            <option value="all">Все роли</option>
                                            <option value="customers">Покупатели</option>
                                            <option value="staff">Сотрудники</option>
                                        </SelectField>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={handleUsersSearch}
                                            disabled={loadingUsers}
                                        >
                                            {loadingUsers ? 'Ищу…' : 'Найти'}
                                        </button>
                                    </div>

                                    <div className={styles.entityList}>
                                        {users.map((user) => (
                                            <div
                                                key={user.id}
                                                className={`${styles.entityRow} ${styles.userRowClickable} ${selectedUserId === user.id ? styles.productRowActive : ''}`}
                                                onClick={() => setSelectedUserId(user.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedUserId(user.id);
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                <div className={styles.productMain}>
                                                    <div className={styles.productName}>{userDisplayName(user)}</div>
                                                    <div className={styles.productMeta}>Логин: @{user.username || 'без логина'}</div>
                                                    <div className={styles.productMeta}>Email: {user.email || 'без email'}</div>
                                                    <div className={styles.productMeta}>
                                                        Заказов: {user.orders_count || 0} · {user.is_active ? 'Активен' : 'Заблокирован'} ·
                                                        {' '}{user.is_staff || user.is_superuser ? 'Сотрудник' : 'Покупатель'}
                                                    </div>
                                                </div>
                                                <div className={styles.productSide}>
                                                    <div className={styles.userStatusCompact}>
                                                        {user.is_active ? 'Активен' : 'Заблокирован'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {!loadingUsers && users.length === 0 ? (
                                            <div className={styles.empty}>Пользователи не найдены</div>
                                        ) : null}
                                    </div>

                                    <div className={styles.pagination}>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => loadUsers({pageValue: usersPage - 1})}
                                            disabled={loadingUsers || usersPage <= 1}
                                        >
                                            Назад
                                        </button>
                                        <div className={styles.paginationPages}>
                                            {Array.from({length: usersPagination.total_pages}, (_, index) => index + 1).map((pageNumber) => (
                                                <button
                                                    key={pageNumber}
                                                    type="button"
                                                    className={`${styles.pageBtn} ${pageNumber === usersPage ? styles.pageBtnActive : ''}`}
                                                    onClick={() => loadUsers({pageValue: pageNumber})}
                                                    disabled={loadingUsers}
                                                >
                                                    {pageNumber}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => loadUsers({pageValue: usersPage + 1})}
                                            disabled={loadingUsers || usersPage >= usersPagination.total_pages}
                                        >
                                            Вперед
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}
