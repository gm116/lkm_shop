import React, {useState} from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import {AuthProvider, useAuth} from '../store/authContext';
import {NotifyProvider} from '../store/notifyContext';
import {refreshAccessToken, logoutUser} from '../api/auth';

jest.mock('react-router-dom', () => {
    const React = require('react');
    const RouterStateContext = React.createContext({
        pathname: '/',
        navigate: () => {},
    });

    const normalizePath = (path) => {
        if (!path) return '/';
        if (!path.startsWith('/')) return `/${path}`;
        return path;
    };

    const splitPath = (path) => normalizePath(path).split('/').filter(Boolean);

    const isMatch = (routePath, currentPath) => {
        if (routePath === '*') return true;
        const routeParts = splitPath(routePath);
        const currentParts = splitPath(currentPath);
        if (routeParts.length !== currentParts.length) return false;
        for (let i = 0; i < routeParts.length; i += 1) {
            const routePart = routeParts[i];
            const currentPart = currentParts[i];
            if (routePart.startsWith(':')) continue;
            if (routePart !== currentPart) return false;
        }
        return true;
    };

    const BrowserRouter = ({children}) => {
        const [pathname, setPathname] = React.useState(globalThis.window.location.pathname || '/');

        React.useEffect(() => {
            const handleLocationChange = () => setPathname(globalThis.window.location.pathname || '/');
            globalThis.window.addEventListener('popstate', handleLocationChange);
            globalThis.window.addEventListener('__router_navigate__', handleLocationChange);
            return () => {
                globalThis.window.removeEventListener('popstate', handleLocationChange);
                globalThis.window.removeEventListener('__router_navigate__', handleLocationChange);
            };
        }, []);

        const navigate = React.useCallback((to, {replace = false} = {}) => {
            if (replace) {
                globalThis.window.history.replaceState({}, '', to);
            } else {
                globalThis.window.history.pushState({}, '', to);
            }
            globalThis.window.dispatchEvent(new Event('__router_navigate__'));
        }, []);

        return (
            <RouterStateContext.Provider value={{pathname, navigate}}>
                {children}
            </RouterStateContext.Provider>
        );
    };

    const Route = ({element}) => element || null;

    const Routes = ({children}) => {
        const {pathname} = React.useContext(RouterStateContext);
        let wildcard = null;
        let matchedElement = null;

        React.Children.forEach(children, (child) => {
            if (!React.isValidElement(child) || matchedElement) return;
            const routePath = child.props?.path;
            if (routePath === '*') {
                wildcard = child.props?.element ?? null;
                return;
            }
            if (routePath && isMatch(routePath, pathname)) {
                matchedElement = child.props?.element ?? null;
            }
        });

        return matchedElement || wildcard || null;
    };

    const Navigate = ({to, replace = false}) => {
        const {navigate} = React.useContext(RouterStateContext);
        React.useEffect(() => {
            navigate(to, {replace});
        }, [navigate, replace, to]);
        return null;
    };

    const useLocation = () => {
        const {pathname} = React.useContext(RouterStateContext);
        return {pathname};
    };

    return {
        BrowserRouter,
        Routes,
        Route,
        Navigate,
        useLocation,
    };
}, {virtual: true});

jest.mock('../api/auth', () => ({
    registerUser: jest.fn(),
    confirmRegisterUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    refreshAccessToken: jest.fn(),
}));

jest.mock('../components/Header', () => () => <div data-testid="header" />);
jest.mock('../components/Footer', () => () => <div data-testid="footer" />);
jest.mock('../components/FeedbackModal', () => () => null);
jest.mock('../components/CookieNotice', () => () => null);

jest.mock('../pages/HomePage', () => () => <div data-testid="home-page" />);
jest.mock('../pages/CatalogPage', () => () => <div data-testid="catalog-page" />);
jest.mock('../pages/ProductPage', () => () => <div data-testid="product-page" />);
jest.mock('../pages/CartPage', () => () => <div data-testid="cart-page" />);
jest.mock('../pages/CheckoutPage', () => () => <div data-testid="checkout-page" />);
jest.mock('../pages/CheckoutRedirectPage', () => () => <div data-testid="checkout-redirect-page" />);
jest.mock('../pages/CheckoutSuccessPage', () => () => <div data-testid="checkout-success-page" />);
jest.mock('../pages/ProfilePage', () => () => <div data-testid="profile-page">Profile page</div>);
jest.mock('../pages/AdminDashboard', () => () => <div data-testid="admin-page" />);
jest.mock('../pages/LoginPage', () => () => <div data-testid="login-page">Login page</div>);
jest.mock('../pages/RegisterPage', () => () => <div data-testid="register-page">Register page</div>);
jest.mock('../pages/ForgotPasswordPage', () => () => <div data-testid="forgot-password-page" />);
jest.mock('../pages/ResetPasswordPage', () => () => <div data-testid="reset-password-page">Reset page</div>);
jest.mock('../pages/StaffOrdersPage', () => () => <div data-testid="staff-orders-page" />);
jest.mock('../pages/StaffOrderPage', () => () => <div data-testid="staff-order-page" />);
jest.mock('../pages/StaffAnalyticsPage', () => () => <div data-testid="staff-analytics-page" />);
jest.mock('../pages/LegalDocumentPage', () => () => <div data-testid="legal-page" />);

const App = require('../App').default;

function makeResponse(status, body = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    };
}

function renderWithProviders(ui) {
    return render(
        <NotifyProvider>
            <AuthProvider>{ui}</AuthProvider>
        </NotifyProvider>
    );
}

function installAuthorizedFetchMock(accessToken) {
    global.fetch = jest.fn((url, options = {}) => {
        if (url === '/api/users/me/') {
            expect(options?.headers?.Authorization).toBe(`Bearer ${accessToken}`);
            return Promise.resolve(makeResponse(200, {
                username: 'tester',
                email: 'tester@example.com',
                first_name: 'Test',
                last_name: 'User',
            }));
        }

        if (url === '/api/users/me/permissions/') {
            expect(options?.headers?.Authorization).toBe(`Bearer ${accessToken}`);
            return Promise.resolve(makeResponse(200, {
                is_staff: false,
                is_superuser: false,
                groups: [],
            }));
        }

        if (url === '/api/users/logout/') {
            return Promise.resolve(makeResponse(200, {detail: 'ok'}));
        }

        throw new Error(`Unexpected fetch call: ${url}`);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    globalThis.window.scrollTo = jest.fn();
    window.history.pushState({}, '', '/');
    logoutUser.mockResolvedValue({});
});

afterEach(() => {
    delete global.fetch;
});

describe('Guest-only route protection for authenticated user', () => {
    test.each(['/login', '/register', '/reset-password/NA/token'])(
        'redirects authenticated user from %s to /profile',
        async (startRoute) => {
            refreshAccessToken.mockResolvedValue({access: 'restored-access'});
            installAuthorizedFetchMock('restored-access');

            window.history.pushState({}, '', startRoute);

            renderWithProviders(<App />);

            expect(await screen.findByTestId('profile-page')).toBeInTheDocument();
            expect(window.location.pathname).toBe('/profile');
        }
    );
});

describe('Session restore after hard refresh', () => {
    test('restores auth state via refresh and opens protected profile page', async () => {
        refreshAccessToken.mockResolvedValue({access: 'refreshed-access'});
        installAuthorizedFetchMock('refreshed-access');

        window.history.pushState({}, '', '/profile');

        renderWithProviders(<App />);

        expect(await screen.findByTestId('profile-page')).toBeInTheDocument();
        expect(refreshAccessToken).toHaveBeenCalledTimes(1);

        const meCalls = global.fetch.mock.calls.filter(([url]) => url === '/api/users/me/');
        const permsCalls = global.fetch.mock.calls.filter(([url]) => url === '/api/users/me/permissions/');

        expect(meCalls).toHaveLength(1);
        expect(permsCalls).toHaveLength(1);
        expect(meCalls[0][1]?.headers?.Authorization).toBe('Bearer refreshed-access');
        expect(permsCalls[0][1]?.headers?.Authorization).toBe('Bearer refreshed-access');
    });
});

function ConcurrentAuthFetchHarness() {
    const {loading, authFetch} = useAuth();
    const [result, setResult] = useState('');

    if (loading) {
        return <div data-testid="auth-loading">Loading</div>;
    }

    return (
        <div>
            <button
                type="button"
                onClick={async () => {
                    const [resA, resB] = await Promise.all([
                        authFetch('/api/protected/a'),
                        authFetch('/api/protected/b'),
                    ]);
                    setResult(`${resA.status}:${resB.status}`);
                }}
            >
                run-concurrent
            </button>
            <div data-testid="concurrent-result">{result}</div>
        </div>
    );
}

describe('Concurrent expired access handling', () => {
    test('does one refresh for parallel 401 responses and retries both requests', async () => {
        refreshAccessToken.mockResolvedValue({access: 'fresh-access'});

        global.fetch = jest.fn((url, options = {}) => {
            const auth = options?.headers?.Authorization;

            if (url === '/api/users/me/') {
                return Promise.resolve(makeResponse(200, {
                    username: 'tester',
                    email: 'tester@example.com',
                }));
            }
            if (url === '/api/users/me/permissions/') {
                return Promise.resolve(makeResponse(200, {
                    is_staff: false,
                    is_superuser: false,
                    groups: [],
                }));
            }

            if (url === '/api/protected/a' || url === '/api/protected/b') {
                if (auth === 'Bearer fresh-access') {
                    return Promise.resolve(makeResponse(200, {ok: true}));
                }
                return Promise.resolve(makeResponse(401, {detail: 'expired'}));
            }

            if (url === '/api/users/logout/') {
                return Promise.resolve(makeResponse(200, {detail: 'ok'}));
            }

            throw new Error(`Unexpected fetch call: ${url}`);
        });

        renderWithProviders(<ConcurrentAuthFetchHarness />);

        await screen.findByText('run-concurrent');
        fireEvent.click(screen.getByText('run-concurrent'));

        await waitFor(() => {
            expect(screen.getByTestId('concurrent-result')).toHaveTextContent('200:200');
        });

        expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    });
});
