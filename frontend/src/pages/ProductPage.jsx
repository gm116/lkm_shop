import { useParams } from 'react-router-dom';
import { useCart } from '../store/cartContext';
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
    const { id } = useParams();
    const { addToCart } = useCart();
    const product = products.find(p => p.id === Number(id));

    if (!product) {
        return (
            <div className={styles.notFound}>Товар не найден</div>
        );
    }

    return (
        <div className={styles.pageWrapper}>
            <div className={styles.card}>
                <img className={styles.image} src={product.image} alt={product.name} />
                <div className={styles.info}>
                    <h2 className={styles.title}>{product.name}</h2>
                    <div className={styles.price}>{product.price} ₽</div>
                    <div className={styles.desc}>{product.description}</div>
                    <button className={styles.cartBtn} onClick={() => addToCart(product)}>
                        В корзину
                    </button>
                </div>
            </div>
        </div>
    );
}