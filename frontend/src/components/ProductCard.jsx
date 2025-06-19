import styles from '../styles/ProductCard.module.css';
import {Link} from 'react-router-dom';
import {useCart} from '../store/cartContext';

export default function ProductCard({product}) {
    const {cart, addToCart, decreaseCount} = useCart();

    const item = cart.find(i => i.id === product.id);
    const count = item ? item.count : 0;

    return (
        <div className={styles.card}>
            <Link to={`/product/${product.id}`}>
                <img className={styles.cardImg} src={product.image} alt={product.name}/>
            </Link>
            <Link to={`/product/${product.id}`} className={styles.cardName}>
                {product.name}
            </Link>
            <div className={styles.cardPrice}>
                {product.price.toLocaleString()} <span className={styles.ruble}>₽</span>
            </div>
            <div className={styles.actionArea}>
                {count === 0 ? (
                    <button className={styles.cartBtn} onClick={() => addToCart(product)}>
                        В корзину
                    </button>
                ) : (
                    <div className={styles.countBlock}>
                        <button className={styles.countBtn} onClick={() => decreaseCount(product.id)}>-</button>
                        <span className={styles.countNum}>{count}</span>
                        <button className={styles.countBtn} onClick={() => addToCart(product)}>+</button>
                    </div>
                )}
            </div>
        </div>
    );
}