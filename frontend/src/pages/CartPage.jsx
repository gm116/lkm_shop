import {Link, useNavigate} from 'react-router-dom';
import {useMemo} from 'react';
import {useCart} from '../store/cartContext';
import styles from '../styles/CartPage.module.css';
import {FaMinus, FaPlus, FaTrash} from 'react-icons/fa';
import productPlaceholder from '../assets/product-placeholder.svg';

function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ru-RU');
}

export default function CartPage() {
    const navigate = useNavigate();
    const {
        cart,
        decreaseCount,
        addToCart,
        removeFromCart,
        clearCart,
        loading
    } = useCart();

    const totals = useMemo(() => {
        const itemsCount = cart.reduce((acc, it) => acc + Number(it.count || 0), 0);
        const total = cart.reduce(
            (sum, it) => sum + Number(it.price || 0) * Number(it.count || 0),
            0
        );
        return {itemsCount, total};
    }, [cart]);

    const handleClear = async () => {
        const ok = window.confirm('Очистить корзину?');
        if (!ok) return;
        await clearCart();
    };

    return (
        <div className={styles.page}>
            <div className={styles.head}>
                <div>
                    <h1 className={styles.title}>Корзина</h1>
                    <div className={styles.sub}>
                        {totals.itemsCount ? `${totals.itemsCount} шт.` : 'Пока пусто'}
                    </div>
                </div>

                {cart.length > 0 && (
                    <button
                        className={styles.btnLight}
                        onClick={handleClear}
                        type="button"
                        disabled={loading}
                    >
                        Очистить
                    </button>
                )}
            </div>

            {cart.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>Корзина пуста</div>
                    <div className={styles.emptyText}>
                        Добавь товары из каталога — они появятся здесь.
                    </div>
                    <button
                        className={styles.btnDark}
                        onClick={() => navigate('/catalog')}
                        type="button"
                    >
                        Перейти в каталог
                    </button>
                </div>
            ) : (
                <div className={styles.layout}>
                    <div className={styles.list}>
                        {cart.map(item => {
                            const productUrl = `/product/${item.id}`;
                            const canInc =
                                item.stock == null ? true : item.count < item.stock;

                            return (
                                <div className={styles.row} key={item.id}>
                                    <Link className={styles.imgWrap} to={productUrl}>
                                        <img
                                            className={styles.img}
                                            src={item.image_url || productPlaceholder}
                                            alt={item.name}
                                            onError={(event) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = productPlaceholder;
                                            }}
                                        />
                                    </Link>

                                    <div className={styles.mid}>
                                        <Link className={styles.name} to={productUrl}>
                                            {item.name}
                                        </Link>

                                        <div className={styles.meta}>
                                            <span className={styles.price}>
                                                {formatMoney(item.price)} ₽
                                            </span>
                                            {item.stock != null && (
                                                <span className={styles.stock}>
                                                    В наличии: {item.stock}
                                                </span>
                                            )}
                                        </div>

                                        <div className={styles.controls}>
                                            <button
                                                className={styles.iconBtn}
                                                onClick={() => decreaseCount(item.id)}
                                                type="button"
                                                disabled={loading}
                                            >
                                                <FaMinus/>
                                            </button>

                                            <div className={styles.qty}>{item.count}</div>

                                            <button
                                                className={styles.iconBtn}
                                                onClick={() => addToCart(item)}
                                                type="button"
                                                disabled={loading || !canInc}
                                            >
                                                <FaPlus/>
                                            </button>

                                            <button
                                                className={styles.trashBtn}
                                                onClick={() => removeFromCart(item.id)}
                                                type="button"
                                                disabled={loading}
                                            >
                                                <FaTrash/>
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.sum}>
                                        {formatMoney(item.price * item.count)} ₽
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <aside className={styles.side}>
                        <div className={styles.sideCard}>
                            <div className={styles.sideTitle}>Итого</div>

                            <div className={styles.kv}>
                                <div className={styles.k}>Товары</div>
                                <div className={styles.v}>{totals.itemsCount} шт.</div>
                            </div>

                            <div className={styles.kv}>
                                <div className={styles.k}>Сумма</div>
                                <div className={styles.vStrong}>
                                    {formatMoney(totals.total)} ₽
                                </div>
                            </div>

                            <button
                                className={styles.btnDark}
                                onClick={() => navigate('/checkout')}
                                type="button"
                                disabled={loading}
                            >
                                Перейти к оформлению
                            </button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
