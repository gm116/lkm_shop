import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {CartProvider} from './store/cartContext';
import {AuthProvider} from './store/authContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <AuthProvider>
            <CartProvider>
                <App/>
            </CartProvider>
        </AuthProvider>
    </React.StrictMode>
);

reportWebVitals();