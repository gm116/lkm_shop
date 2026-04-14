import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {loginUser, logoutUser, refreshAccessToken, registerUser} from '../api/auth';
import {useNotify} from './notifyContext';

const AuthContext = createContext(null);

function normalizeAuthErrorMessage(rawMessage, mode = 'login') {
    const message = String(rawMessage || '').trim();
    const lower = message.toLowerCase();

    if (mode === 'login') {
        if (
            lower.includes('no active account') ||
            lower.includes('invalid credentials') ||
            lower.includes('invalid_grant') ||
            (lower.includes('invalid') && lower.includes('password')) ||
            lower.includes('credentials')
        ) {
            return 'Неверный логин или пароль';
        }
    }

    if (lower.includes('already exists') || lower.includes('уже существует')) {
        if (lower.includes('email')) {
            return 'Этот email уже занят';
        }
        if (lower.includes('username') || lower.includes('логин')) {
            return 'Этот логин уже занят';
        }
        return 'Пользователь с таким логином уже существует';
    }

    if (lower.includes('username:')) {
        if (lower.includes('занят') || lower.includes('exists')) {
            return 'Этот логин уже занят';
        }
    }

    if (lower.includes('email:')) {
        if (lower.includes('занят') || lower.includes('exists')) {
            return 'Этот email уже занят';
        }
        if (lower.includes('valid') || lower.includes('invalid')) {
            return 'Введите корректный email';
        }
    }

    if (lower.includes('too similar to the username')) {
        return 'Пароль слишком похож на логин';
    }
    if (lower.includes('too similar to the email')) {
        return 'Пароль слишком похож на email';
    }
    if (lower.includes('too common')) {
        return 'Пароль слишком простой';
    }
    if (lower.includes('entirely numeric')) {
        return 'Пароль не должен состоять только из цифр';
    }

    if (lower.includes('password') && (lower.includes('too short') || lower.includes('minimum'))) {
        return 'Пароль слишком короткий';
    }

    if (lower.includes('email') && lower.includes('invalid')) {
        return 'Введите корректный email';
    }

    if (mode === 'login') return message || 'Ошибка входа';
    return message || 'Ошибка регистрации';
}

export function AuthProvider({children}) {
    const notify = useNotify();
    const [accessToken, setAccessToken] = useState('');
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!accessToken;

    const fetchMe = async (token) => {
        const res = await fetch('/api/users/me/', {
            method: 'GET',
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            throw new Error('Не авторизован');
        }

        return res.json();
    };

    const fetchPermissions = async (token) => {
        const res = await fetch('/api/users/me/permissions/', {
            method: 'GET',
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            throw new Error('Не авторизован');
        }

        return res.json();
    };

    const hardLogout = async () => {
        try {
            await logoutUser();
        } finally {
            setAccessToken('');
            setUser(null);
            setPermissions(null);
        }
    };

    const ensureFreshAccess = async () => {
        const r = await refreshAccessToken();
        if (!r?.access) {
            await hardLogout();
            return null;
        }

        setAccessToken(r.access);
        return r.access;
    };

    const authFetch = async (url, options = {}) => {
        const token = accessToken;
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        };

        let res = await fetch(url, {
            ...options,
            headers,
            credentials: 'include',
        });

        if (res.status !== 401) {
            return res;
        }

        const newToken = await ensureFreshAccess();
        if (!newToken) {
            return res;
        }

        const retryHeaders = {
            ...(options.headers || {}),
            Authorization: `Bearer ${newToken}`,
        };

        res = await fetch(url, {
            ...options,
            headers: retryHeaders,
            credentials: 'include',
        });

        return res;
    };

    const init = async () => {
        setLoading(true);

        try {
            const token = await ensureFreshAccess();
            if (!token) {
                setLoading(false);
                return;
            }

            const [me, perms] = await Promise.all([
                fetchMe(token),
                fetchPermissions(token),
            ]);

            setUser(me);
            setPermissions(perms);
        } catch (e) {
            setAccessToken('');
            setUser(null);
            setPermissions(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const register = async ({username, email, password}) => {
        setLoading(true);
        try {
            const r = await registerUser({username, email, password});
            setAccessToken(r.access);

            const token = r.access;
            const [me, perms] = await Promise.all([
                fetchMe(token),
                fetchPermissions(token),
            ]);

            setUser(me);
            setPermissions(perms);
            notify.success('Регистрация выполнена');

            return r;
        } catch (e) {
            const friendlyMessage = normalizeAuthErrorMessage(e?.message, 'register');
            notify.error(friendlyMessage);
            throw new Error(friendlyMessage);
        } finally {
            setLoading(false);
        }
    };

    const login = async ({username, password}) => {
        setLoading(true);
        try {
            const r = await loginUser({username, password});
            setAccessToken(r.access);

            const token = r.access;
            const [me, perms] = await Promise.all([
                fetchMe(token),
                fetchPermissions(token),
            ]);

            setUser(me);
            setPermissions(perms);
            notify.success('Вы вошли в аккаунт');

            return r;
        } catch (e) {
            const friendlyMessage = normalizeAuthErrorMessage(e?.message, 'login');
            notify.error(friendlyMessage);
            throw new Error(friendlyMessage);
        } finally {
            setLoading(false);
        }
    };

    const logout = async ({silent = true, message = ''} = {}) => {
        await hardLogout();
        if (!silent) {
            notify.info(message || 'Вы вышли из аккаунта');
        }
    };

    const value = useMemo(() => ({
        accessToken,
        user,
        permissions,
        isAuthenticated,
        loading,
        register,
        login,
        logout,
        authFetch,
        ensureFreshAccess,
         // eslint-disable-next-line
    }), [accessToken, user, permissions, isAuthenticated, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
