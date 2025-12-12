import { apiGet } from './client';

export function getCategories() {
    return apiGet('/api/catalog/categories/');
}

export function getProducts(params = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', String(params.category));
    if (params.brand) qs.set('brand', String(params.brand));
    if (params.search) qs.set('search', params.search);

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiGet(`/api/catalog/products/${suffix}`);
}

export function getProductById(id) {
    return apiGet(`/api/catalog/products/${id}/`);
}

export function getBrands() {
    return apiGet('/api/catalog/brands/');
}