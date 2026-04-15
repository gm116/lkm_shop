import {useEffect, useState} from 'react';
import {BrowserRouter, Routes, Route, Navigate, useLocation} from 'react-router-dom';

import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import CheckoutRedirectPage from "./pages/CheckoutRedirectPage";
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

import StaffOrdersPage from './pages/StaffOrdersPage';
import StaffOrderPage from './pages/StaffOrderPage';
import StaffAnalyticsPage from './pages/StaffAnalyticsPage';

import Header from './components/Header';
import Footer from "./components/Footer";
import FeedbackModal from './components/FeedbackModal';

import {useAuth} from './store/authContext';

import './App.css';

function ProtectedRoute({children}) {
    const {isAuthenticated, loading} = useAuth();

    if (loading) {
        return null;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace/>;
    }

    return children;
}

function StaffRoute({children}) {
    const {isAuthenticated, loading, permissions} = useAuth();

    if (loading) {
        return null;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace/>;
    }

    if (!permissions) {
        return <div style={{padding: 24}}>Загрузка прав…</div>;
    }

    const allowed =
        permissions?.is_superuser ||
        permissions?.is_staff ||
        (Array.isArray(permissions?.groups) && permissions.groups.includes('warehouse'));

    if (!allowed) {
        return <Navigate to="/profile" replace/>;
    }

    return children;
}

function AdminRoute({children}) {
    const {isAuthenticated, loading, permissions} = useAuth();

    if (loading) {
        return null;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace/>;
    }

    if (!permissions) {
        return <div style={{padding: 24}}>Загрузка прав…</div>;
    }

    if (!permissions?.is_superuser && !permissions?.is_staff) {
        return <Navigate to="/profile" replace/>;
    }

    return children;
}

function ScrollToTop() {
    const location = useLocation();

    useEffect(() => {
        window.scrollTo({top: 0, left: 0, behavior: 'auto'});
    }, [location.pathname, location.search]);

    return null;
}

export default function App() {
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    return (
        <BrowserRouter>
            <ScrollToTop/>
            <div className="app-root">
                <Header/>

                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<HomePage/>}/>
                        <Route path="/catalog" element={<CatalogPage/>}/>
                        <Route path="/product/:id" element={<ProductPage/>}/>
                        <Route path="/cart" element={<CartPage/>}/>
                        <Route path="/checkout" element={<CheckoutPage/>}/>
                        <Route path="/checkout/redirect" element={<CheckoutRedirectPage/>}/>

                        <Route path="/login" element={<LoginPage/>}/>
                        <Route path="/register" element={<RegisterPage/>}/>
                        <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
                        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage/>}/>

                        <Route
                            path="/profile"
                            element={
                                <ProtectedRoute>
                                    <ProfilePage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="/staff/analytics"
                            element={
                                <StaffRoute>
                                    <StaffAnalyticsPage/>
                                </StaffRoute>
                            }
                        />
                        <Route
                            path="/staff/orders"
                            element={
                                <StaffRoute>
                                    <StaffOrdersPage/>
                                </StaffRoute>
                            }
                        />
                        <Route
                            path="/staff/orders/:id"
                            element={
                                <StaffRoute>
                                    <StaffOrderPage/>
                                </StaffRoute>
                            }
                        />

                        <Route
                            path="/admin"
                            element={
                                <AdminRoute>
                                    <AdminDashboard/>
                                </AdminRoute>
                            }
                        />
                        <Route path="*" element={<div style={{padding: 24}}>404</div>}/>
                    </Routes>
                </main>

                <Footer onOpenFeedback={() => setFeedbackOpen(true)}/>
                <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)}/>
            </div>
        </BrowserRouter>
    );
}
