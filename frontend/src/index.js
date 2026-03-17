import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {CartProvider} from './store/cartContext';
import {AuthProvider} from './store/authContext';
import {NotifyProvider} from './store/notifyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <NotifyProvider>
            <AuthProvider>
                <CartProvider>
                    <App/>
                </CartProvider>
            </AuthProvider>
        </NotifyProvider>
    </React.StrictMode>
);

reportWebVitals();
