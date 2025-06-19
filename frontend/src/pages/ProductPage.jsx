import {useParams} from 'react-router-dom';
import {useCart} from '../store/cartContext';
import styles from '../styles/ProductPage.module.css';

const products = [
    {
        id: 1,
        name: 'iPhone 15',
        price: 99900,
        image: 'https://via.placeholder.com/300',
        category: 'Смартфоны',
        description: 'Флагманский смартфон Apple.'
    },
    {
        id: 2,
        name: 'MacBook Air',
        price: 120000,
        image: 'https://via.placeholder.com/300',
        category: 'Ноутбуки',
        description: 'Тонкий и мощный ноутбук Apple.'
    },
    {
        id: 3,
        name: 'Чехол для телефона',
        price: 990,
        image: 'https://via.placeholder.com/300',
        category: 'Аксессуары',
        description: 'Универсальный силиконовый чехол.'
    },
    {
        id: 4,
        name: 'Samsung Galaxy S23',
        price: 90000,
        image: 'https://via.placeholder.com/300',
        category: 'Смартфоны',
        description: 'Флагман Samsung с отличной камерой.'
    },
    {
        id: 5,
        name: 'Ноутбук ASUS',
        price: 83000,
        image: 'https://via.placeholder.com/300',
        category: 'Ноутбуки',
        description: 'Производительный ноутбук для работы.'
    },
];

export default function ProductPage() {
    const {id} = useParams();
    const {cart, addToCart, removeFromCart} = useCart();
    const product = products.find(p => String(p.id) === id);

    const cartItem = cart.find(item => item.id === product?.id);
    const count = cartItem ? cartItem.count : 0;

    if (!product) {
        return <div className={styles.notFound}>Товар не найден</div>;
    }

    return (
        <div className={styles.productPageContainer}>
            <div className={styles.productWrapper}>
                <div className={styles.imageBlock}>
                    <img src={product.image} alt={product.name} className={styles.image}/>
                </div>
                <div className={styles.infoBlock}>
                    <h2 className={styles.title}>{product.name}</h2>
                    <div className={styles.price}>{product.price.toLocaleString()} ₽</div>
                    <div className={styles.desc}>{product.description}</div>

                    <div className={styles.actionArea}>
                        {count === 0 ? (
                            <button
                                className={styles.cartBtn}
                                onClick={() => addToCart(product)}
                            >
                                В корзину
                            </button>
                        ) : (
                            <div className={styles.countBlock}>
                                <button
                                    className={styles.countBtn}
                                    onClick={() => removeFromCart(product.id)}
                                >-
                                </button>
                                <span className={styles.countNum}>{count}</span>
                                <button
                                    className={styles.countBtn}
                                    onClick={() => addToCart(product)}
                                >+
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}