import styles from '../styles/ProductCard.module.css';
import {Link} from 'react-router-dom';
import {useCart} from '../store/cartContext';
import productPlaceholder from '../assets/product-placeholder.svg';

function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
}

export default function ProductCard({product}) {
    const {cart, addToCart, decreaseCount, pendingIds} = useCart();

    const item = cart.find((i) => i.id === product.id);
    const count = item ? item.count : 0;

    const img = product?.image_url || product?.image || productPlaceholder;
    const inStock = product?.stock == null ? true : Number(product.stock) > 0;

    const safeProductForCart = {
        ...product,
        image_url: product?.image_url || product?.image || productPlaceholder,
    };

    const isPending = pendingIds?.has(product.id);

    const stockNum = product?.stock == null ? null : Number(product.stock);
    const canInc = stockNum == null ? true : count < stockNum;

    return (
        <article className={styles.card}>
            <div className={styles.media}>
                <Link to={`/product/${product.id}`} className={styles.mediaLink}>
                    <img
                        className={styles.cardImg}
                        src={img}
                        alt={product.name}
                        onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = productPlaceholder;
                        }}
                    />
                </Link>

                {!inStock ? <div className={styles.badgeOut}>Нет в наличии</div> : null}
            </div>

            <Link to={`/product/${product.id}`} className={styles.cardName} title={product.name}>
                {product.name}
            </Link>

            <div className={styles.cardPriceRow}>
                <div className={styles.cardPrice}>
                    {formatMoney(product.price)} <span className={styles.ruble}>₽</span>
                </div>
                {product?.stock != null ? (
                    <div className={styles.stockHint}>Остаток: {product.stock}</div>
                ) : null}
            </div>

            <div className={styles.cardFooter}>
                <div className={styles.actionArea}>
                    {count === 0 ? (
                        <button
                            className={styles.cartBtn}
                            onClick={() => addToCart(safeProductForCart)}
                            type="button"
                            disabled={isPending || !inStock}
                        >
                            В корзину
                        </button>
                    ) : (
                        <div className={styles.countBlock}>
                            <button
                                className={styles.countBtn}
                                onClick={() => decreaseCount(product.id)}
                                type="button"
                                disabled={isPending}
                            >
                                −
                            </button>

                            <span className={styles.countNum}>{count}</span>

                            <button
                                className={styles.countBtn}
                                onClick={() => addToCart(safeProductForCart)}
                                type="button"
                                disabled={isPending || !inStock || !canInc}
                                title={!canInc ? 'Достигнут лимит остатка' : 'Добавить'}
                            >
                                +
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </article>
    );
}
