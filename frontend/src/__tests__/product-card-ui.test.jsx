import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import ProductCard from '../components/ProductCard';
import styles from '../styles/ProductCard.module.css';
import productPlaceholder from '../assets/product-placeholder.svg';

const mockAddToCart = jest.fn();
const mockDecreaseCount = jest.fn();

jest.mock('../store/cartContext', () => ({
    useCart: () => ({
        cart: [],
        addToCart: mockAddToCart,
        decreaseCount: mockDecreaseCount,
        pendingIds: new Set(),
    }),
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, ...props}) => <a {...props}>{children}</a>,
}), {virtual: true});

describe('ProductCard UI states', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('card without image renders placeholder', () => {
        render(
            <ProductCard
                product={{
                    id: 1,
                    name: 'Товар без фото',
                    price: 1500,
                    stock: 3,
                    image: null,
                }}
            />
        );

        const img = screen.getByRole('img', {name: 'Товар без фото'});
        expect(img).toBeInTheDocument();
        expect(img.getAttribute('src')).toContain(productPlaceholder);
    });

    test('out of stock badge is visible and action is disabled', () => {
        render(
            <ProductCard
                product={{
                    id: 2,
                    name: 'Нет в наличии',
                    price: 1800,
                    stock: 0,
                    image: null,
                }}
            />
        );

        const badge = document.querySelector(`.${styles.badgeOut}`);
        expect(badge).toBeInTheDocument();
        expect(badge.classList.contains(styles.badgeOut)).toBe(true);

        const btn = screen.getByRole('button', {name: 'В корзину'});
        expect(btn).toBeDisabled();

        fireEvent.click(btn);
        expect(mockAddToCart).not.toHaveBeenCalled();
    });
});
