import {BrowserRouter, Routes, Route} from 'react-router-dom';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import Header from './components/Header';
import Footer from "./components/Footer";
import './App.css';

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
                        <Route path="/profile" element={<ProfilePage/>}/>
                        <Route path="/admin" element={<AdminDashboard/>}/>
                    </Routes>
                </main>
                <Footer/>
            </div>
        </BrowserRouter>
    );
}