import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {loginUser, logoutUser, refreshAccessToken, registerUser} from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({children}) {
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
            throw new Error('Unauthorized');
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
            throw new Error('Unauthorized');
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

            return r;
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

            return r;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        await hardLogout();
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