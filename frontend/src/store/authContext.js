import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {loginUser, logoutUser, refreshAccessToken, registerUser} from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({children}) {
    const [accessToken, setAccessToken] = useState('');
    const [user, setUser] = useState(null);
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

    const init = async () => {
        try {
            const r = await refreshAccessToken();
            if (!r?.access) {
                setLoading(false);
                return;
            }

            setAccessToken(r.access);

            const me = await fetchMe(r.access);
            setUser(me);
        } catch (e) {
            setAccessToken('');
            setUser(null);
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
        setUser(r.user || {username, email});
        return r;
    };

    const login = async ({username, password}) => {
        const r = await loginUser({username, password});
        setAccessToken(r.access);
        setUser(r.user);
        return r;
    };

    const logout = async () => {
        try {
            await logoutUser();
        } finally {
            setAccessToken('');
            setUser(null);
        }
    };

    const value = useMemo(() => ({
        accessToken,
        user,
        isAuthenticated,
        loading,
        register,
        login,
        logout,
    }), [accessToken, user, isAuthenticated, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}