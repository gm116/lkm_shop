import React from 'react';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';

import ProfilePage from '../pages/ProfilePage';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockReloadUser = jest.fn().mockResolvedValue(null);
const mockRepeatOrder = jest.fn();

let mockAuthFetch;
let mockCartState;

const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

const mockAuthState = {
    accessToken: 'access-token',
    user: {
        username: 'profile_user',
        email: 'profile_user@example.com',
        first_name: 'Иван',
        last_name: 'Петров',
    },
    logout: mockLogout,
    authFetch: (...args) => mockAuthFetch(...args),
    reloadUser: mockReloadUser,
};

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}), {virtual: true});

jest.mock('../store/authContext', () => ({
    useAuth: () => mockAuthState,
}));

jest.mock('../store/cartContext', () => ({
    useCart: () => mockCartState,
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => mockNotify,
}));

function makeResponse(status, payload) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => payload,
    };
}

function makeOrder(overrides = {}) {
    return {
        id: overrides.id || 'bcd2a164-8ef1-47cc-9f30-8fd5afef0011',
        public_id: overrides.public_id || overrides.id || 'bcd2a164-8ef1-47cc-9f30-8fd5afef0011',
        display_id: overrides.display_id || '111111',
        status: overrides.status || 'new',
        payment_succeeded: overrides.payment_succeeded || false,
        payment_url: overrides.payment_url || '',
        total_amount: overrides.total_amount || '3500.00',
        delivery_type: overrides.delivery_type || 'store_pickup',
        delivery_city: overrides.delivery_city || '',
        delivery_address_text: overrides.delivery_address_text || '',
        pickup_point_data: overrides.pickup_point_data || {
            id: 'store_default',
            name: 'Самовывоз',
            address: 'Адрес магазина',
        },
        delivery_service: overrides.delivery_service || '',
        delivery_price: overrides.delivery_price ?? null,
        created_at: overrides.created_at || '2026-04-21T12:00:00Z',
        items: overrides.items || [
            {
                product_id: 42,
                product_name_snapshot: 'Лак HS',
                image_url_snapshot: '',
                price_snapshot: '3500.00',
                quantity: 1,
            },
        ],
    };
}

function setupProfileWithOrders(orders) {
    mockAuthFetch = jest.fn((url) => {
        if (url === '/api/users/me/') {
            return Promise.resolve(makeResponse(200, {
                username: 'profile_user',
                email: 'profile_user@example.com',
                first_name: 'Иван',
                last_name: 'Петров',
            }));
        }
        if (url === '/api/users/addresses/') {
            return Promise.resolve(makeResponse(200, []));
        }
        if (url === '/api/orders/my/') {
            return Promise.resolve(makeResponse(200, orders));
        }
        throw new Error(`Unexpected URL: ${url}`);
    });

    mockCartState = {
        cart: [],
        repeatOrder: mockRepeatOrder,
    };

    return render(<ProfilePage />);
}

describe('Profile orders: statuses and repeat flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('order statuses are shown consistently without conflicting badges', async () => {
        const unpaidNew = makeOrder({
            id: 'bcd2a164-8ef1-47cc-9f30-8fd5afef1001',
            display_id: '100001',
            status: 'new',
            payment_succeeded: false,
        });
        const canceled = makeOrder({
            id: 'bcd2a164-8ef1-47cc-9f30-8fd5afef1002',
            display_id: '100002',
            status: 'canceled',
            payment_succeeded: false,
        });

        setupProfileWithOrders([unpaidNew, canceled]);

        const firstOrderNumber = await screen.findByText('Заказ #100001');
        const secondOrderNumber = await screen.findByText('Заказ #100002');

        const firstCard = firstOrderNumber.closest('details');
        const secondCard = secondOrderNumber.closest('details');

        expect(within(firstCard).getAllByText('Ожидает оплаты').length).toBeGreaterThan(0);
        expect(within(firstCard).queryByText('Оплачен')).not.toBeInTheDocument();

        expect(within(secondCard).getAllByText('Отменён').length).toBeGreaterThan(0);
        expect(within(secondCard).queryByText('Ожидает оплаты')).not.toBeInTheDocument();
    });

    test('repeat order full success notifies success and navigates to cart', async () => {
        mockRepeatOrder.mockResolvedValue({
            detail: 'Товары из заказа добавлены в корзину',
            added_positions: 2,
            skipped_positions: 0,
            partial_positions: 0,
        });

        const order = makeOrder({id: 'bcd2a164-8ef1-47cc-9f30-8fd5afef2001', display_id: '200001'});
        setupProfileWithOrders([order]);

        const button = await screen.findByRole('button', {name: 'Повторить заказ'});
        fireEvent.click(button);

        await waitFor(() => {
            expect(mockRepeatOrder).toHaveBeenCalledWith(order.id, {replace: true});
        });
        expect(mockNotify.success).toHaveBeenCalledWith('Товары из заказа добавлены в корзину');
        expect(mockNavigate).toHaveBeenCalledWith('/cart');
    });

    test('repeat order partial success reports readable warning', async () => {
        mockRepeatOrder.mockResolvedValue({
            detail: 'Заказ добавлен в корзину частично',
            added_positions: 1,
            skipped_positions: 2,
            partial_positions: 1,
        });

        const order = makeOrder({id: 'bcd2a164-8ef1-47cc-9f30-8fd5afef3001', display_id: '300001'});
        setupProfileWithOrders([order]);

        const button = await screen.findByRole('button', {name: 'Повторить заказ'});
        fireEvent.click(button);

        await waitFor(() => {
            expect(mockNotify.warning).toHaveBeenCalledWith('Заказ добавлен в корзину частично. Добавлено позиций: 1, пропущено: 2.');
        });
        expect(mockNavigate).toHaveBeenCalledWith('/cart');
    });

    test('repeat order with no added items shows error reason and does not navigate', async () => {
        mockRepeatOrder.mockResolvedValue({
            detail: 'Невозможно повторить заказ: все товары недоступны',
            added_positions: 0,
            skipped_positions: 2,
            partial_positions: 0,
        });

        const order = makeOrder({id: 'bcd2a164-8ef1-47cc-9f30-8fd5afef4001', display_id: '400001'});
        setupProfileWithOrders([order]);

        const button = await screen.findByRole('button', {name: 'Повторить заказ'});
        fireEvent.click(button);

        await waitFor(() => {
            expect(mockNotify.error).toHaveBeenCalledWith('Невозможно повторить заказ: все товары недоступны');
        });
        expect(mockNavigate).not.toHaveBeenCalledWith('/cart');
    });
});
