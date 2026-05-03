import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import CheckoutPage from '../pages/CheckoutPage';
import styles from '../styles/CheckoutPage.module.css';

const mockNavigate = jest.fn();
const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

let mockAuthState;
let mockCartState;

jest.mock('../store/authContext', () => ({
    useAuth: () => mockAuthState,
}));

jest.mock('../store/cartContext', () => ({
    useCart: () => mockCartState,
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => mockNotify,
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, ...props}) => <a {...props}>{children}</a>,
    useNavigate: () => mockNavigate,
}), {virtual: true});

function makeResponse(status, payload) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => payload,
    };
}

function renderCheckout() {
    return render(<CheckoutPage />);
}

function getCheckoutForm(container) {
    return container.querySelector('form');
}

describe('Checkout page flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockCartState = {
            cart: [
                {
                    id: 42,
                    name: 'Лак HS',
                    count: 1,
                    price: 13098,
                    stock: 10,
                    image_url: '',
                },
            ],
            clearCart: jest.fn().mockResolvedValue(undefined),
            loading: false,
        };

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'access-token',
            authFetch: jest.fn((url) => {
                if (url === '/api/users/me/prefill/') {
                    return Promise.resolve(makeResponse(200, {
                        first_name: 'Петр',
                        last_name: 'Иванов',
                        username: 'petr',
                        email: 'petr@example.com',
                        default_address: {
                            phone: '+7 (999) 111-22-33',
                            city: 'Казань',
                        },
                    }));
                }
                throw new Error(`Unexpected authFetch call: ${url}`);
            }),
            logout: jest.fn(),
        };
    });

    test('unauthorized user sees dedicated checkout screen', () => {
        mockAuthState = {
            isAuthenticated: false,
            accessToken: '',
            authFetch: jest.fn(),
            logout: jest.fn(),
        };

        renderCheckout();

        expect(screen.getByText('Войдите, чтобы продолжить оформление')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Войти'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Регистрация'})).toBeInTheDocument();
    });

    test('checkout validates required email, phone and name on submit', async () => {
        const view = renderCheckout();

        await screen.findByText('Контактные данные');

        fireEvent.change(screen.getByPlaceholderText('ФИО'), {target: {value: '   '}});
        fireEvent.change(screen.getByPlaceholderText('+7 (___) ___-__-__'), {target: {value: '123'}});
        fireEvent.change(screen.getByPlaceholderText('example@mail.ru'), {target: {value: 'bad-email'}});

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.submit(getCheckoutForm(view.container));

        expect((await screen.findAllByText('Укажите имя получателя')).length).toBeGreaterThan(0);
        expect(screen.getByText('Неверный формат телефона')).toBeInTheDocument();
        expect(screen.getByText('Введите корректный email')).toBeInTheDocument();
    });

    test('delivery modes contain only pickup and pvz, courier option is absent in UI', async () => {
        const view = renderCheckout();

        await screen.findByText('Способ получения');

        expect(screen.getByText('Самовывоз')).toBeInTheDocument();
        expect(screen.getByText('Доставка до ПВЗ')).toBeInTheDocument();
        expect(screen.queryByText('Доставка курьером')).not.toBeInTheDocument();
    });

    test('pvz mode requires delivery service and city', async () => {
        const view = renderCheckout();

        await screen.findByText('Способ получения');

        fireEvent.click(screen.getByRole('button', {name: /Доставка до ПВЗ/i}));

        const serviceSelect = view.container.querySelector('select');
        const cityInput = screen.getByPlaceholderText('Например, Казань');

        fireEvent.change(serviceSelect, {target: {value: ''}});
        fireEvent.change(cityInput, {target: {value: '  '}});

        fireEvent.change(screen.getByPlaceholderText('ФИО'), {target: {value: 'Петр'}});
        fireEvent.change(screen.getByPlaceholderText('+7 (___) ___-__-__'), {target: {value: '+7 (999) 111-22-33'}});
        fireEvent.change(screen.getByPlaceholderText('example@mail.ru'), {target: {value: 'petr@example.com'}});

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.submit(getCheckoutForm(view.container));

        expect((await screen.findAllByText('Выберите службу доставки')).length).toBeGreaterThan(0);
        expect((await screen.findAllByText('Укажите город для доставки до ПВЗ')).length).toBeGreaterThan(0);
    });

    test('checkout create order error keeps entered values', async () => {
        const authFetch = jest.fn((url) => {
            if (url === '/api/users/me/prefill/') {
                return Promise.resolve(makeResponse(200, {
                    first_name: '',
                    last_name: '',
                    username: '',
                    email: '',
                    default_address: {},
                }));
            }
            if (url === '/api/orders/create-from-cart/') {
                return Promise.resolve(makeResponse(400, {detail: 'Корзина пуста'}));
            }
            throw new Error(`Unexpected authFetch call: ${url}`);
        });

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'access-token',
            authFetch,
            logout: jest.fn(),
        };

        renderCheckout();

        await screen.findByText('Контактные данные');

        const nameInput = screen.getByPlaceholderText('ФИО');
        const phoneInput = screen.getByPlaceholderText('+7 (___) ___-__-__');
        const emailInput = screen.getByPlaceholderText('example@mail.ru');

        fireEvent.change(nameInput, {target: {value: 'Иван Иванов'}});
        fireEvent.change(phoneInput, {target: {value: '+7 (912) 123-45-67'}});
        fireEvent.change(emailInput, {target: {value: 'ivan@example.com'}});

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', {name: 'Перейти к оплате'}));

        await waitFor(() => {
            expect(mockNotify.error).toHaveBeenCalledWith('Корзина пуста');
        });

        expect(nameInput.value).toBe('Иван Иванов');
        expect(phoneInput.value).toBe('+7 (912) 123-45-67');
        expect(emailInput.value).toBe('ivan@example.com');
    });

    test('checkout displays skeleton while profile prefill is loading', async () => {
        let resolvePrefill;
        const pendingPrefill = new Promise((resolve) => {
            resolvePrefill = resolve;
        });

        mockAuthState = {
            isAuthenticated: true,
            accessToken: 'access-token',
            authFetch: jest.fn((url) => {
                if (url === '/api/users/me/prefill/') {
                    return pendingPrefill;
                }
                throw new Error(`Unexpected authFetch call: ${url}`);
            }),
            logout: jest.fn(),
        };

        const view = renderCheckout();

        expect(screen.queryByText('Контактные данные')).not.toBeInTheDocument();
        const skeletonBlock = view.container.querySelector(`.${styles.formSkeleton}`);
        expect(skeletonBlock).toBeInTheDocument();

        resolvePrefill(makeResponse(200, {
            first_name: 'Петр',
            last_name: 'Иванов',
            username: 'petr',
            email: 'petr@example.com',
            default_address: {phone: '+7 (999) 111-22-33', city: 'Казань'},
        }));

        expect(await screen.findByText('Контактные данные')).toBeInTheDocument();
    });
});
