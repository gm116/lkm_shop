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

import Header from './components/Header';
import Footer from "./components/Footer";

import {useAuth} from './store/authContext';

import './App.css';

/* Защитный враппер */
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

                        {/* админ — пока без защиты */}
                        <Route path="/admin" element={<AdminDashboard/>}/>
                    </Routes>
                </main>

                <Footer/>
            </div>
        </BrowserRouter>
    );
}