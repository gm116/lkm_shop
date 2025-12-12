import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';

import {useCart} from '../store/cartContext';
import styles from '../styles/ProductPage.module.css';
import {getProductById} from '../api/catalog';

export default function ProductPage() {
    const {id} = useParams();
    const {cart, addToCart, decreaseCount} = useCart();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError('');
                const data = await getProductById(id);
                if (cancelled) return;
                setProduct(data);
            } catch (e) {
                if (cancelled) return;
                setError(e.message || 'Товар не найден');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) {
        return <div className={styles.notFound}>Загрузка...</div>;
    }

    if (error || !product) {
        return <div className={styles.notFound}>{error || 'Товар не найден'}</div>;
    }

    const image = (product.images && product.images[0]) ? product.images[0] : 'https://via.placeholder.com/400x400?text=No+image';

    const cartItem = cart.find(item => item.id === product.id);
    const count = cartItem ? cartItem.count : 0;

    return (
        <div className={styles.productPageContainer}>
            <div className={styles.productWrapper}>
                <div className={styles.imageBlock}>
                    <img src={image} alt={product.name} className={styles.image}/>
                </div>

                <div className={styles.infoBlock}>
                    <h2 className={styles.title}>{product.name}</h2>
                    <div className={styles.price}>{Number(product.price).toLocaleString()} ₽</div>
                    <div className={styles.desc}>{product.description || ''}</div>

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
            </div>
        </div>
    );
}