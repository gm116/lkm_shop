import {useCart} from '../store/cartContext';
import {FaShoppingBasket} from 'react-icons/fa';
import {useNavigate} from 'react-router-dom';
import styles from '../styles/CartPage.module.css';

export default function CartPage() {
    const navigate = useNavigate();
    const {cart, removeFromCart, clearCart} = useCart();

    const total = cart.reduce((sum, item) => sum + item.price * item.count, 0);

    return (
        <div className={styles.cartContainer}>
            <h2 className={styles.cartTitle}>Корзина</h2>
            {cart.length === 0 ? (
                <div className={styles.cartEmpty}>Корзина пуста</div>
            ) : (
                <>
                    <ul className={styles.cartList}>
                        {cart.map(item => (
                            <li className={styles.cartListItem} key={item.id}>
                                <span>{item.name} — {item.price} ₽ × {item.count}</span>
                                <button
                                    className={styles.cartDeleteBtn}
                                    onClick={() => removeFromCart(item.id)}
                                    title="Удалить"
                                >
                                    <FaShoppingBasket size={20}/>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className={styles.cartTotal}>
                        Итого: <span>{total} ₽</span>
                    </div>

                    <div className={styles.cartActions}>
                        <button className={styles.cartClearBtn} onClick={clearCart}>Очистить корзину</button>
                        <button className={styles.checkoutBtn} onClick={() => navigate('/checkout')}>
                            Перейти к оформлению
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}