import {createContext, useContext, useState} from 'react';

const CartContext = createContext();

export function CartProvider({children}) {
    const [cart, setCart] = useState([]);

    const addToCart = (product) => {
        setCart(prev =>
            prev.find(item => item.id === product.id)
                ? prev.map(item => item.id === product.id ? {...item, count: item.count + 1} : item)
                : [...prev, {...product, count: 1}]
        );
    };

    const decreaseCount = (id) => {
        setCart(prev =>
            prev
                .map(item => item.id === id ? {...item, count: item.count - 1} : item)
                .filter(item => item.count > 0)
        );
    };

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const clearCart = () => setCart([]);

    return (
        <CartContext.Provider value={{cart, addToCart, decreaseCount, removeFromCart, clearCart}}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    return useContext(CartContext);
}