import {useEffect, useMemo, useRef, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {FaChevronLeft, FaChevronRight} from 'react-icons/fa';

import {useCart} from '../store/cartContext';
import {useNotify} from '../store/notifyContext';
import styles from '../styles/ProductPage.module.css';
import {getProductById} from '../api/catalog';

const FALLBACK_IMAGE = 'https://via.placeholder.com/900x1200?text=No+image';

export default function ProductPage() {
    const {id} = useParams();
    const {cart, addToCart, decreaseCount, pendingIds} = useCart();
    const notify = useNotify();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const touchStartX = useRef(null);

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

    useEffect(() => {
        setActiveImageIndex(0);
    }, [product?.id]);

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    const galleryImages = useMemo(() => {
        if (!product) return [FALLBACK_IMAGE];
        const prepared = Array.isArray(product.images)
            ? product.images.filter(Boolean)
            : [];
        return prepared.length > 0 ? prepared : [FALLBACK_IMAGE];
    }, [product]);

    const hasGallery = galleryImages.length > 1;
    const activeImage = galleryImages[Math.min(activeImageIndex, galleryImages.length - 1)] || FALLBACK_IMAGE;

    function showPrevImage() {
        setActiveImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
    }

    function showNextImage() {
        setActiveImageIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
    }

    function onTouchStart(event) {
        touchStartX.current = event.changedTouches?.[0]?.clientX ?? null;
    }

    function onTouchEnd(event) {
        if (touchStartX.current == null) return;
        const endX = event.changedTouches?.[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 40 || !hasGallery) return;
        if (delta > 0) showPrevImage();
        else showNextImage();
    }

    function formatMoney(value) {
        return Number(value || 0).toLocaleString('ru-RU');
    }

    if (loading) {
        return <div className={styles.notFound}>Загрузка товара...</div>;
    }

    if (error || !product) {
        return <div className={styles.notFound}>{error || 'Товар не найден'}</div>;
    }

    const cartItem = cart.find(item => item.id === product.id);
    const count = cartItem ? cartItem.count : 0;
    const stockNum = product?.stock == null ? null : Number(product.stock);
    const inStock = stockNum == null ? true : stockNum > 0;
    const canInc = stockNum == null ? true : count < stockNum;
    const isPending = pendingIds?.has(product.id);

    const safeProductForCart = {
        ...product,
        image_url: galleryImages[0] || FALLBACK_IMAGE,
    };

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.breadcrumbs}>
                    <Link to="/catalog" className={styles.backLink}>Каталог</Link>
                    <span className={styles.breadcrumbDot}>/</span>
                    <span className={styles.currentCrumb}>{product.name}</span>
                </div>

                <div className={styles.topLayout}>
                    <section className={styles.galleryCard}>
                        <div
                            className={styles.mainImageWrap}
                            onTouchStart={onTouchStart}
                            onTouchEnd={onTouchEnd}
                        >
                            <img src={activeImage} alt={product.name} className={styles.mainImage}/>

                            {hasGallery ? (
                                <>
                                    <button
                                        type="button"
                                        className={`${styles.galleryNav} ${styles.galleryPrev}`}
                                        onClick={showPrevImage}
                                        aria-label="Предыдущее фото"
                                    >
                                        <FaChevronLeft/>
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.galleryNav} ${styles.galleryNext}`}
                                        onClick={showNextImage}
                                        aria-label="Следующее фото"
                                    >
                                        <FaChevronRight/>
                                    </button>
                                    <div className={styles.imageCounter}>
                                        {activeImageIndex + 1} из {galleryImages.length}
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {hasGallery ? (
                            <div className={styles.thumbGrid}>
                                {galleryImages.map((imageUrl, index) => (
                                    <button
                                        key={`${imageUrl}-${index}`}
                                        type="button"
                                        onClick={() => setActiveImageIndex(index)}
                                        className={`${styles.thumbButton} ${index === activeImageIndex ? styles.thumbButtonActive : ''}`}
                                        aria-label={`Показать фото ${index + 1}`}
                                    >
                                        <img src={imageUrl} alt="" className={styles.thumbImage}/>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </section>

                    <section className={`${styles.detailsCard} ${styles.specsCard}`}>
                        <h2 className={styles.sectionTitle}>Характеристики</h2>
                        <div className={styles.metaRows}>
                            <div className={styles.metaRow}>
                                <span className={styles.metaLabel}>Категория</span>
                                <span className={styles.metaValue}>{product?.category?.name || 'Не указана'}</span>
                            </div>
                            <div className={styles.metaRow}>
                                <span className={styles.metaLabel}>Бренд</span>
                                <span className={styles.metaValue}>{product?.brand?.name || 'Не указан'}</span>
                            </div>
                            <div className={styles.metaRow}>
                                <span className={styles.metaLabel}>Артикул</span>
                                <span className={styles.metaValue}>{product?.sku || '—'}</span>
                            </div>
                        </div>
                    </section>

                    <aside className={styles.buyCard}>
                        <h1 className={styles.title}>{product.name}</h1>

                        <div className={styles.price}>{formatMoney(product.price)} ₽</div>

                        <div className={`${styles.stockBadge} ${inStock ? styles.stockIn : styles.stockOut}`}>
                            {inStock ? (stockNum == null ? 'В наличии' : `В наличии: ${stockNum}`) : 'Нет в наличии'}
                        </div>

                        <div className={styles.actionCard}>
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

                        <div className={styles.buyInfoList}>
                            <div className={styles.buyInfoItem}>Доставка по городу и по России</div>
                            <div className={styles.buyInfoItem}>Консультация по материалам</div>
                            <div className={styles.buyInfoItem}>Подбор под задачу по ремонту</div>
                        </div>
                    </aside>
                </div>

                <section className={styles.descriptionCard}>
                    <h2 className={styles.sectionTitle}>Описание</h2>
                    <p className={styles.description}>
                        {product.description || 'Описание для этого товара пока не заполнено.'}
                    </p>
                </section>
            </div>
        </div>
    );
}
