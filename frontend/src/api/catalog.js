import { apiGet } from './client';

export function getCategories() {
    return apiGet('/api/catalog/categories/');
}

export function getProducts(params = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', String(params.category));
    if (params.brand) qs.set('brand', String(params.brand));
    if (params.search) qs.set('search', params.search);
    if (params.price_min !== undefined && params.price_min !== null && params.price_min !== '') {
        qs.set('price_min', String(params.price_min));
    }
    if (params.price_max !== undefined && params.price_max !== null && params.price_max !== '') {
        qs.set('price_max', String(params.price_max));
    }

    if (params.facets && typeof params.facets === 'object') {
        Object.entries(params.facets)
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ru'))
            .forEach(([name, values]) => {
                (Array.isArray(values) ? values : [])
                    .filter(Boolean)
                    .sort((a, b) => String(a).localeCompare(String(b), 'ru'))
                    .forEach((value) => qs.append('facet', `${name}::${value}`));
            });
    }

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiGet(`/api/catalog/products/${suffix}`);
}

export function getProductById(id) {
    return apiGet(`/api/catalog/products/${id}/`);
}

export function getBrands() {
    return apiGet('/api/catalog/brands/');
}

export function getCatalogFilters(params = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', String(params.category));
    if (params.brand) qs.set('brand', String(params.brand));
    if (params.search) qs.set('search', params.search);
    if (params.price_min !== undefined && params.price_min !== null && params.price_min !== '') {
        qs.set('price_min', String(params.price_min));
    }
    if (params.price_max !== undefined && params.price_max !== null && params.price_max !== '') {
        qs.set('price_max', String(params.price_max));
    }
    if (params.facets && typeof params.facets === 'object') {
        Object.entries(params.facets)
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ru'))
            .forEach(([name, values]) => {
                (Array.isArray(values) ? values : [])
                    .filter(Boolean)
                    .sort((a, b) => String(a).localeCompare(String(b), 'ru'))
                    .forEach((value) => qs.append('facet', `${name}::${value}`));
            });
    }

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiGet(`/api/catalog/filters/${suffix}`);
}
