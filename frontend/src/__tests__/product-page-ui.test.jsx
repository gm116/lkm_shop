import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import ProductPage from '../pages/ProductPage';
import styles from '../styles/ProductPage.module.css';

const mockGetProductById = jest.fn();
const mockNotifyError = jest.fn();
let mockRouteParams = {id: '42'};

const mockCartState = {
    cart: [],
    addToCart: jest.fn(),
    decreaseCount: jest.fn(),
    pendingIds: new Set(),
};

jest.mock('../api/catalog', () => ({
    getProductById: (...args) => mockGetProductById(...args),
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => ({
        error: mockNotifyError,
        success: jest.fn(),
        warning: jest.fn(),
        info: jest.fn(),
    }),
}));

jest.mock('../store/cartContext', () => ({
    useCart: () => mockCartState,
}));

jest.mock('react-router-dom', () => ({
    useParams: () => mockRouteParams,
    Link: ({children, to, ...props}) => <a href={to} {...props}>{children}</a>,
}), {virtual: true});

function makeProduct(overrides = {}) {
    return {
        id: 42,
        name: 'Лак HS Cardea',
        slug: 'lak-hs-cardea',
        description: 'Описание',
        sku: 'BV400Z045',
        price: 13098,
        stock: 7,
        category: {id: 1, name: 'Лак автомобильный', slug: 'lak', parent: null, is_active: true},
        brand: {id: 1, name: 'Cardea', slug: 'cardea', is_active: true},
        images: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
        characteristics: [
            {name: 'Степень блеска', value: 'Глянцевый'},
            {name: 'Объем', value: '5л'},
        ],
        ...overrides,
    };
}

describe('Product page behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRouteParams = {id: '42'};
        mockCartState.cart = [];
        mockCartState.pendingIds = new Set();
        document.title = 'Initial Title';
    });

    test('loads product by id and maps api fields to ui', async () => {
        mockGetProductById.mockResolvedValue(makeProduct());

        render(<ProductPage />);

        expect(await screen.findByRole('heading', {name: 'Лак HS Cardea'})).toBeInTheDocument();
        expect(screen.getByText('13 098 ₽')).toBeInTheDocument();
        expect(screen.getByText('В наличии: 7')).toBeInTheDocument();
        expect(screen.getByText('BV400Z045')).toBeInTheDocument();
        expect(mockGetProductById).toHaveBeenCalledWith('42');
    });

    test('supports slug param in route and updates seo title', async () => {
        mockRouteParams = {id: 'lak-hs-cardea'};
        mockGetProductById.mockResolvedValue(makeProduct());

        render(<ProductPage />);

        expect(await screen.findByRole('heading', {name: 'Лак HS Cardea'})).toBeInTheDocument();
        expect(mockGetProductById).toHaveBeenCalledWith('lak-hs-cardea');
        expect(document.title).toContain('Лак HS Cardea');
    });

    test('returns not found ui for 404/error', async () => {
        mockGetProductById.mockRejectedValue(new Error('Товар не найден'));

        render(<ProductPage />);

        expect(await screen.findByText('Товар не найден')).toBeInTheDocument();
        expect(mockNotifyError).toHaveBeenCalledWith('Товар не найден');
    });

    test('gallery navigation works via arrows and thumbnails', async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        render(<ProductPage />);

        expect(await screen.findByText('1 из 3')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Следующее фото'}));
        expect(await screen.findByText('2 из 3')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Предыдущее фото'}));
        expect(await screen.findByText('1 из 3')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Показать фото 3'}));
        expect(await screen.findByText('3 из 3')).toBeInTheDocument();
    });

    test('main image uses 3:4 image class and long characteristics are rendered', async () => {
        const longValue = 'Очень длинное значение характеристики '.repeat(8);
        mockGetProductById.mockResolvedValue(
            makeProduct({
                characteristics: [
                    {name: 'Технология нанесения', value: longValue},
                ],
            })
        );

        render(<ProductPage />);

        const mainImage = await screen.findByRole('img', {name: 'Лак HS Cardea'});
        expect(mainImage.className).toContain(styles.mainImage);
        expect(screen.getByText('Технология нанесения')).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('Очень длинное значение характеристики'))).toBeInTheDocument();
    });

    test('add to cart button is disabled when stock is 0', async () => {
        mockGetProductById.mockResolvedValue(makeProduct({stock: 0}));

        render(<ProductPage />);

        const btn = await screen.findByRole('button', {name: 'В корзину'});
        expect(btn).toBeDisabled();
    });

    test('quantity cannot increase above stock', async () => {
        mockGetProductById.mockResolvedValue(makeProduct({stock: 2}));
        mockCartState.cart = [{id: 42, count: 2}];

        render(<ProductPage />);

        const plusBtn = await screen.findByRole('button', {name: '+'});
        expect(plusBtn).toBeDisabled();
    });

    test('breadcrumbs lead back to catalog', async () => {
        mockGetProductById.mockResolvedValue(makeProduct());

        render(<ProductPage />);

        await screen.findByRole('heading', {name: 'Лак HS Cardea'});
        const crumb = screen.getByRole('link', {name: 'Каталог'});
        expect(crumb).toHaveAttribute('href', '/catalog');
    });

    test('shows skeleton layout while product is loading', async () => {
        let resolveRequest;
        const pending = new Promise((resolve) => {
            resolveRequest = () => resolve(makeProduct());
        });
        mockGetProductById.mockReturnValue(pending);

        const {container} = render(<ProductPage />);

        expect(container.querySelector(`.${styles.topLayout}`)).toBeInTheDocument();
        expect(container.querySelector(`.${styles.skImage}`)).toBeInTheDocument();

        resolveRequest();

        await waitFor(() => {
            expect(screen.getByRole('heading', {name: 'Лак HS Cardea'})).toBeInTheDocument();
        });
    });
});
