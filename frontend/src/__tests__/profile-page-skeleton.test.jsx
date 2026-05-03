import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';

import ProfilePage from '../pages/ProfilePage';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockReloadUser = jest.fn().mockResolvedValue(null);
const mockAuthFetch = jest.fn();
const mockRepeatOrder = jest.fn();

const mockAuthState = {
    accessToken: 'access-token',
    user: {
        username: 'profile_user',
        email: 'profile_user@example.com',
        first_name: 'Иван',
        last_name: 'Петров',
    },
    logout: mockLogout,
    authFetch: mockAuthFetch,
    reloadUser: mockReloadUser,
};

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}), {virtual: true});

jest.mock('../store/authContext', () => ({
    useAuth: () => mockAuthState,
}));

jest.mock('../store/cartContext', () => ({
    useCart: () => ({
        cart: [],
        repeatOrder: mockRepeatOrder,
    }),
}));

const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

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

describe('Profile page skeleton and loading behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('shows skeleton state while profile blocks are loading', async () => {
        mockAuthFetch.mockImplementation((url) => new Promise((resolve) => {
            setTimeout(() => {
                if (url === '/api/users/me/') {
                    resolve(makeResponse(200, {
                        username: 'profile_user',
                        email: 'profile_user@example.com',
                        first_name: 'Иван',
                        last_name: 'Петров',
                    }));
                    return;
                }
                resolve(makeResponse(200, []));
            }, 50);
        }));

        const {container} = render(<ProfilePage />);

        const busyBlocks = container.querySelectorAll('[aria-busy=\"true\"]');
        expect(busyBlocks.length).toBeGreaterThanOrEqual(3);
    });

    test('replaces skeleton with loaded profile data after successful responses', async () => {
        mockAuthFetch.mockImplementation((url) => {
            if (url === '/api/users/me/') {
                return Promise.resolve(
                    makeResponse(200, {
                        username: 'profile_user',
                        email: 'profile_user@example.com',
                        first_name: 'Иван',
                        last_name: 'Петров',
                    })
                );
            }
            if (url === '/api/users/addresses/') {
                return Promise.resolve(makeResponse(200, []));
            }
            if (url === '/api/orders/my/') {
                return Promise.resolve(makeResponse(200, []));
            }
            throw new Error(`Unexpected URL: ${url}`);
        });

        const {container} = render(<ProfilePage />);

        expect(await screen.findByText('Иван')).toBeInTheDocument();
        expect(screen.getByText('Петров')).toBeInTheDocument();
        expect(screen.getByText('profile_user@example.com')).toBeInTheDocument();

        await waitFor(() => {
            expect(container.querySelectorAll('[aria-busy=\"true\"]')).toHaveLength(0);
        });
    });

    test('shows empty addresses state when user has no saved addresses', async () => {
        mockAuthFetch.mockImplementation((url) => {
            if (url === '/api/users/me/') {
                return Promise.resolve(
                    makeResponse(200, {
                        username: 'profile_user',
                        email: 'profile_user@example.com',
                        first_name: 'Иван',
                        last_name: 'Петров',
                    })
                );
            }
            if (url === '/api/users/addresses/') {
                return Promise.resolve(makeResponse(200, []));
            }
            if (url === '/api/orders/my/') {
                return Promise.resolve(makeResponse(200, []));
            }
            throw new Error(`Unexpected URL: ${url}`);
        });

        render(<ProfilePage />);

        expect(await screen.findByText('Адресов пока нет')).toBeInTheDocument();
    });
});
