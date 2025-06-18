import styles from '../styles/ProductCard.module.css';
import {Link} from 'react-router-dom';
import {useState} from 'react';

export default function ProductCard({product}) {
    const [count, setCount] = useState(0);

    return (
        <div className={styles.card}>
            <Link to={`/product/${product.id}`}>
                <img className={styles.cardImg} src={product.image} alt={product.name}/>
            </Link>
            <Link to={`/product/${product.id}`} className={styles.cardName}>
                {product.name}
            </Link>
            <div className={styles.cardPrice}>{product.price.toLocaleString()} <span className={styles.ruble}>₽</span>
            </div>
            <div className={styles.actionArea}>
                {count === 0 ? (
                    <button className={styles.cartBtn} onClick={() => setCount(1)}>
                        В корзину
                    </button>
                ) : (
                    <div className={styles.countBlock}>
                        <button className={styles.countBtn} onClick={() => setCount(count > 1 ? count - 1 : 0)}>-
                        </button>
                        <span className={styles.countNum}>{count}</span>
                        <button className={styles.countBtn} onClick={() => setCount(count + 1)}>+</button>
                    </div>
                )}
            </div>
        </div>
    );
}