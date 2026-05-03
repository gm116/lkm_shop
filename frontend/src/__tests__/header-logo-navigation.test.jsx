import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import Header from '../components/Header';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
    Link: ({children, ...props}) => <a {...props}>{children}</a>,
    useNavigate: () => mockNavigate,
    useLocation: () => ({pathname: '/catalog', search: ''}),
}), {virtual: true});

jest.mock('../store/cartContext', () => ({
    useCart: () => ({cart: []}),
}));

jest.mock('../store/authContext', () => ({
    useAuth: () => ({
        isAuthenticated: false,
        logout: jest.fn(),
        permissions: {is_staff: false, is_superuser: false, groups: []},
        loading: false,
    }),
}));

describe('Header logo navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('clicking logo navigates to catalog once', () => {
        render(<Header />);

        const logo = screen.getByRole('link', {name: /магазин|всеэмалиру/i});
        fireEvent.click(logo);

        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/catalog');
    });
});
