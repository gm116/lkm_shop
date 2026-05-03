import React from 'react';
import {render, screen} from '@testing-library/react';

import CartPage from '../pages/CartPage';

let mockCartState;

jest.mock('../store/cartContext', () => ({
    useCart: () => mockCartState,
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, ...props}) => <a {...props}>{children}</a>,
    useNavigate: () => jest.fn(),
}), {virtual: true});

describe('Cart page totals', () => {
    beforeEach(() => {
        mockCartState = {
            cart: [],
            decreaseCount: jest.fn(),
            addToCart: jest.fn(),
            removeFromCart: jest.fn(),
            clearCart: jest.fn(),
            loading: false,
        };
    });

    test('totals are calculated correctly and updated after cart data change', () => {
        mockCartState.cart = [
            {id: 1, name: 'Лак', price: 1500, count: 2, stock: 10, image_url: ''},
            {id: 2, name: 'Грунт', price: 2500, count: 1, stock: 8, image_url: ''},
        ];

        const view = render(<CartPage />);

        const itemsKv = screen.getByText('Товары').parentElement;
        const sumKv = screen.getByText('Сумма').parentElement;
        expect(itemsKv).toHaveTextContent('3 шт.');
        expect(sumKv).toHaveTextContent('5 500 ₽');

        mockCartState.cart = [
            {id: 1, name: 'Лак', price: 1500, count: 1, stock: 10, image_url: ''},
        ];

        view.rerender(<CartPage />);

        expect(itemsKv).toHaveTextContent('1 шт.');
        expect(sumKv).toHaveTextContent('1 500 ₽');
    });
});
