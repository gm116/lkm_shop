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

    const init = async () => {
        try {
            const r = await refreshAccessToken();
            if (!r?.access) {
                setLoading(false);
                return;
            }

            setAccessToken(r.access);

            const [me, perms] = await Promise.all([
                fetchMe(r.access),
                fetchPermissions(r.access),
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
    };

    const login = async ({username, password}) => {
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
    };

    const logout = async () => {
        try {
            await logoutUser();
        } finally {
            setAccessToken('');
            setUser(null);
            setPermissions(null);
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