import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import styles from '../styles/CatalogPage.module.css';
import {useState} from 'react';

const mockProducts = [
    {id: 1, name: 'MacBook', price: 89900, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8'},
    {id: 2, name: 'Lenovo', price: 120000, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb'},
    {id: 3, name: 'Монитор', price: 8900, image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308'},
    {id: 4, name: 'Планшет', price: 80000, image: 'https://images.unsplash.com/photo-1511452885600-a2c5a75cae48'},
    {id: 5, name: 'MacBook', price: 89900, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8'},
    {id: 6, name: 'Lenovo', price: 120000, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb'},
    {id: 7, name: 'Монитор', price: 8900, image: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308'},
    {id: 8, name: 'Планшет', price: 80000, image: 'https://images.unsplash.com/photo-1511452885600-a2c5a75cae48'}
];

const categories = ['Все', 'Смартфоны', 'Ноутбуки', 'Аксессуары'];

export default function CatalogPage() {
    const [selectedCategory, setSelectedCategory] = useState('Все');
    const [search] = useState('');

    const filtered = mockProducts.filter(p =>
        (selectedCategory === 'Все' || p.name.toLowerCase().includes(selectedCategory.toLowerCase())) &&
        (search === '' || p.name.toLowerCase().includes(search.toLowerCase()))
    );

    const emptyCards = Array(4).fill(null);

    return (
        <div className={styles.catalogWrapper}>
            <div className={styles.catalogTitle}>Каталог товаров</div>
            <div className={styles.topRow}>
                <div className={styles.sidebarBlock}>
                    <Sidebar
                        categories={categories}
                        selectedCategory={selectedCategory}
                        onSelectCategory={setSelectedCategory}
                    />
                </div>
                <div className={styles.mainBlock}>
                    <div className={styles.productsGrid}>
                        {filtered.length === 0
                            ? emptyCards.map((_, i) =>
                                <div className={styles.emptyCard} key={i}>
                                    {i === 0 && (
                                        <span className={styles.notFound}>
                                            Нет товаров по заданным фильтрам
                                        </span>
                                    )}
                                </div>
                            )
                            : filtered.map(product => <ProductCard product={product} key={product.id}/>)
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}