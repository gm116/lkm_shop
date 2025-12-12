import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';

import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

import StaffOrdersPage from './pages/StaffOrdersPage';
import StaffOrderPage from './pages/StaffOrderPage';

import Header from './components/Header';
import Footer from "./components/Footer";

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

    const allowed =
        permissions?.is_superuser ||
        permissions?.is_staff ||
        (Array.isArray(permissions?.groups) && permissions.groups.includes('warehouse'));

    if (!allowed) {
        return <Navigate to="/profile" replace/>;
    }

    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-root">
                <Header/>

                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<HomePage/>}/>
                        <Route path="/catalog" element={<CatalogPage/>}/>
                        <Route path="/product/:id" element={<ProductPage/>}/>
                        <Route path="/cart" element={<CartPage/>}/>
                        <Route path="/checkout" element={<CheckoutPage/>}/>

                        {/* AUTH */}
                        <Route path="/login" element={<LoginPage/>}/>
                        <Route path="/register" element={<RegisterPage/>}/>

                        {/* PROFILE — защищён */}
                        <Route
                            path="/profile"
                            element={
                                <ProtectedRoute>
                                    <ProfilePage/>
                                </ProtectedRoute>
                            }
                        />

                        {/* STAFF — защищён по ролям */}
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

                        {/* админ — пока без защиты */}
                        <Route path="/admin" element={<AdminDashboard/>}/>
                    </Routes>
                </main>

                <Footer/>
            </div>
        </BrowserRouter>
    );
}