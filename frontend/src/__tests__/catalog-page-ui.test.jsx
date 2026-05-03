import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import CatalogPage from '../pages/CatalogPage';

const mockGetCategories = jest.fn();
const mockGetBrands = jest.fn();
const mockGetProducts = jest.fn();
const mockGetCatalogFilters = jest.fn();
const mockNotifyError = jest.fn();

let mockLocationState = {pathname: '/catalog', search: ''};
const mockNavigate = jest.fn((to) => {
    if (typeof to === 'string') {
        mockLocationState = {pathname: to, search: ''};
        return;
    }
    const pathname = to?.pathname || mockLocationState.pathname;
    const search = to?.search || '';
    mockLocationState = {pathname, search};
});

jest.mock('react-router-dom', () => ({
    useLocation: () => mockLocationState,
    useNavigate: () => mockNavigate,
}), {virtual: true});

jest.mock('../store/notifyContext', () => ({
    useNotify: () => ({
        error: mockNotifyError,
        success: jest.fn(),
        warning: jest.fn(),
        info: jest.fn(),
    }),
}));

jest.mock('../api/catalog', () => ({
    getCategories: (...args) => mockGetCategories(...args),
    getBrands: (...args) => mockGetBrands(...args),
    getProducts: (...args) => mockGetProducts(...args),
    getCatalogFilters: (...args) => mockGetCatalogFilters(...args),
}));

jest.mock('../components/ProductCard', () => ({product}) => (
    <div data-testid="product-card">{product.name}::{product.stock}</div>
));

function makeProducts(total) {
    const arr = [];
    for (let i = 1; i <= total; i += 1) {
        arr.push({
            id: i,
            name: `Товар ${i}`,
            slug: `tovar-${i}`,
            price: 1000 + i,
            stock: i % 5 === 0 ? 0 : 3,
            is_active: true,
            category: {id: 1, name: 'Категория', slug: 'cat', parent: null, is_active: true},
            brand: {id: 1, name: 'Brand', slug: 'brand', is_active: true},
            image: null,
            characteristics: [],
        });
    }
    return arr;
}

function setupApi({products = makeProducts(30), filters = {}, categories, brands} = {}) {
    mockGetCategories.mockResolvedValue(categories || [
        {id: 1, name: 'Автохимия', slug: 'auto', parent: null, is_active: true},
        {id: 2, name: 'Лаки', slug: 'laki', parent: 1, is_active: true},
    ]);
    mockGetBrands.mockResolvedValue(brands || [
        {id: 1, name: 'Brand', slug: 'brand', is_active: true},
    ]);
    mockGetProducts.mockResolvedValue(products);
    mockGetCatalogFilters.mockResolvedValue({
        price: {min: 1000, max: 5000},
        brands: [{id: 1, name: 'Brand', count: products.length}],
        attributes: [],
        products_count: products.length,
        brands_total: 1,
        attributes_total: 0,
        brands_limited: false,
        attributes_limited: false,
        ...filters,
    });
}

describe('Catalog page UI behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLocationState = {pathname: '/catalog', search: ''};
        global.window.scrollTo = jest.fn();
    });

    test('empty result shows proper empty state block', async () => {
        setupApi({products: [], filters: {products_count: 0, brands: []}});

        render(<CatalogPage />);

        expect(await screen.findByText('Нет товаров по выбранным фильтрам')).toBeInTheDocument();
        expect(screen.getByText('Попробуйте снять часть фильтров или переключиться на раздел «Все товары».')).toBeInTheDocument();
    });

    test('out of stock items are rendered at the end of product list', async () => {
        setupApi({
            products: [
                {id: 1, name: 'В наличии A', price: 1000, stock: 4, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
                {id: 2, name: 'Нет в наличии', price: 900, stock: 0, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
                {id: 3, name: 'В наличии B', price: 1100, stock: 1, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
            ],
        });

        render(<CatalogPage />);

        const cards = await screen.findAllByTestId('product-card');
        const text = cards.map((node) => node.textContent);
        expect(text[text.length - 1]).toContain('Нет в наличии::0');
    });

    test('page switch scrolls to top', async () => {
        setupApi();
        render(<CatalogPage />);

        expect(await screen.findByText(/Страница 1 из 2/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Вперёд'}));

        await waitFor(() => {
            expect(window.scrollTo).toHaveBeenCalled();
        });
        expect(window.scrollTo.mock.calls[0][0]).toMatchObject({top: 0, left: 0, behavior: 'smooth'});
    });

    test('filter change does not scroll page to top', async () => {
        setupApi();
        render(<CatalogPage />);

        expect(await screen.findByText(/Каталог товаров/)).toBeInTheDocument();
        const categoryBtn = await screen.findByRole('button', {name: 'Автохимия'});
        fireEvent.click(categoryBtn);

        await waitFor(() => {
            expect(mockGetProducts).toHaveBeenCalledTimes(2);
        });
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test('page size control is in pagination and updates visible range', async () => {
        setupApi({products: makeProducts(30)});
        render(<CatalogPage />);

        expect(await screen.findByText('Товаров на странице')).toBeInTheDocument();
        expect(screen.getByText('1-24 из 30')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('combobox'), {target: {value: '12'}});

        await waitFor(() => {
            expect(screen.getByText('1-12 из 30')).toBeInTheDocument();
        });
        expect(screen.getByText(/Страница 1 из 3/)).toBeInTheDocument();
    });

    test('url query is parsed on load and restored into API params', async () => {
        mockLocationState = {
            pathname: '/catalog',
            search: '?search=alpha&category=2&brand=1&price_min=1000&price_max=2500&sort=price_desc&page_size=12&page=2&facet=%D0%A6%D0%B2%D0%B5%D1%82::%D0%A7%D0%B5%D1%80%D0%BD%D1%8B%D0%B9',
        };
        setupApi({products: makeProducts(15)});

        render(<CatalogPage />);

        await waitFor(() => {
            expect(mockGetProducts).toHaveBeenCalled();
        });

        const [params] = mockGetProducts.mock.calls[0];
        expect(params.search).toBe('alpha');
        expect(params.category).toBe(2);
        expect(params.brand).toBe(1);
        expect(params.price_min).toBe('1000');
        expect(params.price_max).toBe('2500');
        expect(params.facets).toEqual({Цвет: ['Черный']});
    });

    test('changing category updates query via navigate', async () => {
        setupApi();
        render(<CatalogPage />);

        expect(await screen.findByText('Каталог товаров')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Автохимия'}));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalled();
        });

        const lastCall = mockNavigate.mock.calls[mockNavigate.mock.calls.length - 1][0];
        expect(lastCall.search).toContain('category=1');
    });

    test('shows skeleton during load and then replaces with cards', async () => {
        let resolveProducts;
        const productsPromise = new Promise((resolve) => {
            resolveProducts = () => resolve(makeProducts(5));
        });

        mockGetCategories.mockResolvedValue([{id: 1, name: 'Автохимия', slug: 'a', parent: null, is_active: true}]);
        mockGetBrands.mockResolvedValue([{id: 1, name: 'Brand', slug: 'b', is_active: true}]);
        mockGetProducts.mockImplementation(() => productsPromise);
        mockGetCatalogFilters.mockImplementation(() => productsPromise.then(() => ({
            price: {min: 1000, max: 5000},
            brands: [{id: 1, name: 'Brand', count: 5}],
            attributes: [],
            products_count: 5,
            brands_total: 1,
            attributes_total: 0,
            brands_limited: false,
            attributes_limited: false,
        })));

        const {container} = render(<CatalogPage />);

        expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);

        resolveProducts();

        await waitFor(() => {
            expect(screen.getAllByTestId('product-card').length).toBeGreaterThan(0);
        });

        await waitFor(() => {
            expect(container.querySelectorAll('[class*=\"skeletonCard\"]').length).toBe(0);
        });
    });

    test('sort options work and keep stable order for equal values', async () => {
        setupApi({
            products: [
                {id: 1, name: 'Бета', price: 1000, stock: 4, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
                {id: 2, name: 'Альфа', price: 1000, stock: 2, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
                {id: 3, name: 'Гамма', price: 1500, stock: 0, is_active: true, category: {id: 1, name: 'C'}, brand: null, image: null, characteristics: []},
            ],
        });

        render(<CatalogPage />);

        const cardsDefault = await screen.findAllByTestId('product-card');
        expect(cardsDefault.map((n) => n.textContent)).toEqual([
            'Бета::4',
            'Альфа::2',
            'Гамма::0',
        ]);

        fireEvent.click(screen.getByText('Сначала дороже'));
        await waitFor(() => {
            const rows = screen.getAllByTestId('product-card').map((n) => n.textContent);
            expect(rows).toEqual(['Бета::4', 'Альфа::2', 'Гамма::0']);
        });

        fireEvent.click(screen.getByText('По названию (А-Я)'));
        await waitFor(() => {
            const rows = screen.getAllByTestId('product-card').map((n) => n.textContent);
            expect(rows).toEqual(['Альфа::2', 'Бета::4', 'Гамма::0']);
        });
    });

    test('initial load does not trigger duplicate products refetch loop', async () => {
        setupApi({products: makeProducts(10)});
        render(<CatalogPage />);

        await screen.findAllByTestId('product-card');

        await waitFor(() => {
            expect(mockGetProducts).toHaveBeenCalledTimes(1);
            expect(mockGetCatalogFilters).toHaveBeenCalledTimes(1);
        });
    });
});
