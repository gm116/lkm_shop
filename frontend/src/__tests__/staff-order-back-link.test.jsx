import React from 'react';
import {render, screen} from '@testing-library/react';

import StaffOrderPage from '../pages/StaffOrderPage';

const mockAuthFetch = jest.fn();
const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

const backParam = '/staff/orders?status=paid&date_from=2026-04-01&date_to=2026-04-30';

jest.mock('react-router-dom', () => ({
    Link: ({to, children, ...rest}) => <a href={to} {...rest}>{children}</a>,
    useLocation: () => ({pathname: '/staff/orders/ord-1', state: {}}),
    useParams: () => ({id: 'ord-1'}),
    useSearchParams: () => [new URLSearchParams(`back=${encodeURIComponent(backParam)}`)],
}), {virtual: true});

jest.mock('../store/authContext', () => ({
    useAuth: () => ({
        authFetch: (...args) => mockAuthFetch(...args),
    }),
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => mockNotify,
}));

function makeResponse(status, payload) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(payload),
    };
}

describe('Staff order back-link navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockAuthFetch.mockImplementation((url) => {
            if (url === '/api/staff/orders/ord-1/') {
                return Promise.resolve(makeResponse(200, {
                    id: 'ord-1',
                    display_id: '100001',
                    status: 'paid',
                    total_amount: '1500.00',
                    customer_name: 'Петр Иванов',
                    customer_phone: '+7 (999) 111-22-33',
                    customer_email: 'petr@example.com',
                    delivery_type: 'store_pickup',
                    pickup_point_data: {name: 'Самовывоз', address: 'Адрес магазина'},
                    delivery_service: '',
                    delivery_city: '',
                    delivery_address_text: '',
                    created_at: '2026-04-20T10:00:00Z',
                    updated_at: '2026-04-20T10:05:00Z',
                    items: [],
                }));
            }
            return Promise.resolve(makeResponse(404, {detail: 'Not found'}));
        });
    });

    test('back link keeps list query parameters from back param', async () => {
        render(<StaffOrderPage />);

        const backLink = await screen.findByRole('link', {name: 'Назад к списку'});
        expect(backLink.getAttribute('href')).toBe(backParam);
    });
});
