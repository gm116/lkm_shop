import React from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';

import {CartProvider, useCart} from '../store/cartContext';

const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

const mockLogout = jest.fn();
let mockAuthState;

jest.mock('../store/authContext', () => ({
    useAuth: () => mockAuthState,
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => mockNotify,
}));

function makeResponse(status, payload = null) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => (payload == null ? '' : JSON.stringify(payload)),
    };
}

let latestCartContext = null;

function Harness() {
    latestCartContext = useCart();
    return (
        <div>
            <div data-testid="items-count">{latestCartContext.cart.length}</div>
            <div data-testid="items-state">{JSON.stringify(latestCartContext.cart)}</div>
        </div>
    );
}

function renderCartProvider() {
    return render(
        <CartProvider>
            <Harness />
        </CartProvider>
    );
}

describe('Cart context flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        latestCartContext = null;
        mockAuthState = {
            isAuthenticated: false,
            accessToken: '',
            authFetch: jest.fn(),
            logout: mockLogout,
        };
    });

    test('guest cart is loaded from localStorage and can be changed locally', async () => {
        localStorage.setItem('guest_cart', JSON.stringify([
            {
                id: 7,
                name: 'Лак гостя',
                slug: 'guest-item',
                image_url: '',
                price: 1900,
                stock: 3,
                count: 1,
            },
        ]));

        renderCartProvider();

        expect(await screen.findByTestId('items-count')).toHaveTextContent('1');

        await act(async () => {
            await latestCartContext.addToCart({id: 7, name: 'Лак гостя', price: 1900, stock: 3});
        });

        let parsed = JSON.parse(screen.getByTestId('items-state').textContent);
        expect(parsed[0].count).toBe(2);

        await act(async () => {
            await latestCartContext.removeFromCart(7);
        });

        expect(screen.getByTestId('items-count')).toHaveTextContent('0');
    });

    test('guest cart is synchronized to server after login and server cart is loaded', async () => {
        localStorage.setItem('guest_cart', JSON.stringify([
            {id: 10, name: 'Гостевой товар', price: 1000, stock: 4, count: 2},
        ]));

        const authFetch = jest.fn((url, options = {}) => {
            if (url === '/api/cart/sync/' && options.method === 'POST') {
                const payload = JSON.parse(options.body);
                expect(payload.items).toEqual([{product_id: 10, quantity: 2}]);
                return Promise.resolve(makeResponse(200, {id: 1, items: []}));
            }
            if (url === '/api/cart/' && options.method === 'GET') {
                return Promise.resolve(makeResponse(200, {
                    id: 1,
                    items: [
                        {
                            id: 501,
                            product_id: 10,
                            product_name: 'Гостевой товар',
                            product_slug: 'guest-item',
                            image_url: '',
                            price: '1000.00',
                            stock: 4,
                            quantity: 2,
                        },
                    ],
                }));
            }
            return Promise.resolve(makeResponse(404, {detail: 'Unexpected call'}));
        });

        const view = renderCartProvider();
        expect(await screen.findByTestId('items-count')).toHaveTextContent('1');

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'token',
            authFetch,
            logout: mockLogout,
        };

        view.rerender(
            <CartProvider>
                <Harness />
            </CartProvider>
        );

        await waitFor(() => {
            expect(authFetch).toHaveBeenCalledWith('/api/cart/sync/', expect.objectContaining({method: 'POST'}));
            expect(authFetch).toHaveBeenCalledWith('/api/cart/', expect.objectContaining({method: 'GET'}));
        });

        expect(screen.getByTestId('items-count')).toHaveTextContent('1');
        expect(localStorage.getItem('guest_cart')).toBeNull();
    });

    test('adding after stock became zero shows error and keeps cart unchanged', async () => {
        const authFetch = jest.fn((url, options = {}) => {
            if (url === '/api/cart/' && options.method === 'GET') {
                return Promise.resolve(makeResponse(200, {
                    id: 1,
                    items: [
                        {
                            id: 301,
                            product_id: 55,
                            product_name: 'Лак',
                            product_slug: 'lak',
                            image_url: '',
                            price: '3500.00',
                            stock: 2,
                            quantity: 1,
                        },
                    ],
                }));
            }
            if (url === '/api/cart/items/' && options.method === 'POST') {
                return Promise.resolve(makeResponse(400, {detail: 'Недостаточно остатка для товара id=55'}));
            }
            return Promise.resolve(makeResponse(404, {detail: 'Unexpected call'}));
        });

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'token',
            authFetch,
            logout: mockLogout,
        };

        renderCartProvider();

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('1');
        });

        await act(async () => {
            await latestCartContext.addToCart({id: 55, stock: 2});
        });

        expect(mockNotify.error).toHaveBeenCalledWith('Недостаточно остатка для товара id=55');
        const parsed = JSON.parse(screen.getByTestId('items-state').textContent);
        expect(parsed[0].count).toBe(1);
    });

    test('dead cart item can be removed with fallback when delete endpoint returns 404', async () => {
        let getCartCall = 0;
        const authFetch = jest.fn((url, options = {}) => {
            if (url === '/api/cart/' && options.method === 'GET') {
                getCartCall += 1;
                if (getCartCall === 1) {
                    return Promise.resolve(makeResponse(200, {
                        id: 1,
                        items: [
                            {
                                id: 999,
                                product_id: 77,
                                product_name: 'Мертвый товар',
                                product_slug: 'dead-item',
                                image_url: '',
                                price: '2000.00',
                                stock: 0,
                                quantity: 1,
                            },
                        ],
                    }));
                }
                return Promise.resolve(makeResponse(200, {id: 1, items: []}));
            }

            if (url === '/api/cart/items/999/' && options.method === 'DELETE') {
                return Promise.resolve(makeResponse(404, {detail: 'Позиция корзины не найдена'}));
            }

            if (url === '/api/cart/items/' && options.method === 'POST') {
                const body = JSON.parse(options.body);
                expect(body).toEqual({product_id: 77, quantity: 0});
                return Promise.resolve(makeResponse(200, {id: 1, items: []}));
            }

            return Promise.resolve(makeResponse(404, {detail: 'Unexpected call'}));
        });

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'token',
            authFetch,
            logout: mockLogout,
        };

        renderCartProvider();

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('1');
        });

        await act(async () => {
            await latestCartContext.removeFromCart(77);
        });

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('0');
        });

        expect(mockNotify.error).not.toHaveBeenCalled();
    });

    test('add and remove cart operations do not produce success toasts', async () => {
        let currentItems = [];
        const authFetch = jest.fn((url, options = {}) => {
            if (url === '/api/cart/' && options.method === 'GET') {
                return Promise.resolve(makeResponse(200, {id: 1, items: currentItems}));
            }

            if (url === '/api/cart/items/' && options.method === 'POST') {
                const body = JSON.parse(options.body);
                if (body.quantity > 0) {
                    currentItems = [
                        {
                            id: 123,
                            product_id: body.product_id,
                            product_name: 'Товар без тостов',
                            product_slug: 'silent-item',
                            image_url: '',
                            price: '1100.00',
                            stock: 8,
                            quantity: body.quantity,
                        },
                    ];
                } else {
                    currentItems = [];
                }
                return Promise.resolve(makeResponse(200, {id: 1, items: currentItems}));
            }

            if (url === '/api/cart/items/123/' && options.method === 'DELETE') {
                currentItems = [];
                return Promise.resolve(makeResponse(204, null));
            }

            return Promise.resolve(makeResponse(404, {detail: 'Unexpected call'}));
        });

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'token',
            authFetch,
            logout: mockLogout,
        };

        renderCartProvider();

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('0');
        });

        await act(async () => {
            await latestCartContext.addToCart({id: 66, stock: 8});
        });

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('1');
        });

        await act(async () => {
            await latestCartContext.removeFromCart(66);
        });

        await waitFor(() => {
            expect(screen.getByTestId('items-count')).toHaveTextContent('0');
        });

        expect(mockNotify.success).not.toHaveBeenCalled();
    });
});
