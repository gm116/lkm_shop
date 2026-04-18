import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {
    FaArrowRight,
    FaBookOpen,
    FaBoxOpen,
    FaComments,
    FaExternalLinkAlt,
    FaGraduationCap,
    FaMapMarkerAlt,
    FaPalette,
    FaStore,
    FaTruck,
} from 'react-icons/fa';

import {getBrands, getCategories, getProducts} from '../api/catalog';
import styles from '../styles/HomePage.module.css';
import {useNotify} from '../store/notifyContext';
import productPlaceholder from '../assets/product-placeholder.svg';

const HERO_BENEFITS = [
    'Подбор по коду и образцу',
    'Консультации по технологии окраски',
    'Обучение колористике',
    'Доставка по городу и России',
];

const PRODUCT_GROUPS = [
    {
        title: 'Автоэмали',
        text: 'Подбор цвета, системы окраски и слив по коду.',
        icon: FaPalette,
    },
    {
        title: 'Материалы для кузовного ремонта',
        text: 'Грунты, лаки, шпатлевки, абразивы и расходные материалы.',
        icon: FaBoxOpen,
    },
    {
        title: 'ЛКМ и расходники',
        text: 'Материалы для подготовки поверхности и нанесения покрытий.',
        icon: FaStore,
    },
    {
        title: 'Оборудование',
        text: 'Инструмент и оборудование для малярных работ.',
        icon: FaTruck,
    },
];

const SERVICE_ITEMS = [
    {
        title: 'Консультации по технологии окраски',
        text: 'Подскажем схему нанесения, совместимость материалов и последовательность работ.',
        icon: FaComments,
    },
    {
        title: 'Подбор материалов под задачу',
        text: 'Собираем полный комплект: от подготовки поверхности до финишного покрытия.',
        icon: FaPalette,
    },
    {
        title: 'Обучение колористике',
        text: 'Практические занятия по подбору цвета и работе с автоэмалями.',
        icon: FaGraduationCap,
    },
    {
        title: 'Подготовка будущих технологов',
        text: 'База по подбору, нанесению и организации малярного процесса.',
        icon: FaBookOpen,
    },
];

const CONTACT_LINKS = [
    {
        title: '2ГИС',
        note: 'Маршрут и навигация',
        href: 'https://2gis.ru/nabchelny/search/%D0%B0%D0%B2%D1%82%D0%BE%D1%8D%D0%BC%D0%B0%D0%BB%D0%B8',
    },
    {
        title: 'Яндекс Карты',
        note: 'Адрес и схема проезда',
        href: 'https://yandex.ru/maps/chelny/search/%D0%B0%D0%B2%D1%82%D0%BE%D1%8D%D0%BC%D0%B0%D0%BB%D0%B8/',
    },
    {
        title: 'Telegram',
        note: 'Консультации и быстрые вопросы',
        href: 'https://t.me/',
    },
    {
        title: 'WhatsApp',
        note: 'Связь по материалам и заказам',
        href: 'https://wa.me/79000000000',
    },
    {
        title: 'Ozon',
        note: 'Онлайн-витрина магазина',
        href: 'https://www.ozon.ru/',
    },
];

function ContactCard({title, note, href}) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className={styles.contactCard}>
            <div className={styles.contactTitle}>{title}</div>
            <div className={styles.contactText}>{note}</div>
            <div className={styles.contactAction}>
                Открыть
                <FaExternalLinkAlt />
            </div>
        </a>
    );
}

export default function HomePage() {
    const notify = useNotify();
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [products, setProducts] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (error) notify.error(error);
    }, [error, notify]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setError('');
                const [categoriesData, brandsData, productsData] = await Promise.all([
                    getCategories(),
                    getBrands(),
                    getProducts(),
                ]);

                if (cancelled) return;

                setCategories(Array.isArray(categoriesData) ? categoriesData : []);
                setBrands(Array.isArray(brandsData) ? brandsData : []);
                setProducts(Array.isArray(productsData) ? productsData : []);
            } catch (e) {
                if (cancelled) return;
                setError(e?.message || 'Не удалось загрузить данные для главной страницы');
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, []);

    const rootCategories = useMemo(() => {
        return categories.filter((category) => category.parent == null).slice(0, 6);
    }, [categories]);

    const featuredBrands = useMemo(() => brands.slice(0, 12), [brands]);
    const featuredProducts = useMemo(() => products.slice(0, 4), [products]);

    function formatMoney(value) {
        const n = Number(value || 0);
        return `${n.toLocaleString('ru-RU')} ₽`;
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <section className={styles.hero}>
                    <div className={styles.heroMain}>
                        <div className={styles.eyebrow}>
                            Набережные Челны · автоэмали и материалы для кузовного ремонта
                        </div>

                        <h1 className={styles.heroTitle}>
                            Автоэмали, материалы для кузовного ремонта и оборудование для малярных работ.
                        </h1>

                        <p className={styles.heroText}>
                            Подбор автоэмалей, материалы для кузовного ремонта, расходники, консультации по технологии окраски, работа с физическими и юридическими лицами.
                        </p>

                        <div className={styles.heroActions}>
                            <Link to="/catalog" className={styles.primaryAction}>
                                Перейти в каталог
                                <FaArrowRight />
                            </Link>
                            <a href="#contacts" className={styles.secondaryAction}>
                                Контакты и площадки
                            </a>
                        </div>

                        <div className={styles.heroBenefits}>
                            {HERO_BENEFITS.map((item) => (
                                <div key={item} className={styles.heroBenefit}>{item}</div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.heroSide}>
                        <div className={styles.infoCard}>
                            <div className={styles.infoTitle}>Кому подходим</div>
                            <div className={styles.infoText}>
                                Частные мастера, автосервисы, кузовные участки и компании.
                            </div>
                        </div>

                        <div className={styles.infoCard}>
                            <div className={styles.infoTitle}>Консультации и обучение</div>
                            <div className={styles.infoList}>
                                <div className={styles.infoItem}>Консультации по технологии окраски и нанесению материалов</div>
                                <div className={styles.infoItem}>Обучение по подбору цвета и колористике</div>
                                <div className={styles.infoItem}>Подготовка будущих технологов</div>
                            </div>
                        </div>
                    </div>
                </section>

                {error ? <div className={styles.notice}>{error}</div> : null}

                <section className={styles.section}>
                    <div className={styles.productShowcaseLayout}>
                        <div className={styles.productShowcaseMain}>
                            <h2 className={`${styles.sectionTitle} ${styles.productShowcaseTitle}`}>Популярные товары</h2>

                            <div className={styles.productShowcaseGrid}>
                                {featuredProducts.length > 0 ? featuredProducts.map((product) => {
                                    const image = product?.image_url || product?.image || productPlaceholder;

                                    return (
                                        <Link to={`/product/${product.id}`} key={product.id} className={styles.productShowcaseCard}>
                                            <div className={styles.productShowcaseImageWrap}>
                                                <img
                                                    src={image}
                                                    alt={product.name}
                                                    className={styles.productShowcaseImage}
                                                    onError={(event) => {
                                                        event.currentTarget.onerror = null;
                                                        event.currentTarget.src = productPlaceholder;
                                                    }}
                                                />
                                            </div>
                                            <div className={styles.productShowcaseName}>{product.name}</div>
                                            <div className={styles.productShowcasePrice}>{formatMoney(product.price)}</div>
                                        </Link>
                                    );
                                }) : (
                                    <div className={styles.emptyState}>Товары появятся после загрузки каталога.</div>
                                )}
                            </div>

                            <Link to="/catalog" className={styles.productsMoreButton}>
                                Показать больше
                                <FaArrowRight />
                            </Link>
                        </div>

                        <div className={`${styles.panel} ${styles.quickPanel}`}>
                            <h2 className={styles.sectionTitle}>Быстрый вход в разделы</h2>

                            <div className={`${styles.categoryGrid} ${styles.quickCategoryGrid}`}>
                                {rootCategories.length > 0 ? rootCategories.map((category) => (
                                    <Link
                                        key={category.id}
                                        to={`/catalog?category=${category.id}`}
                                        className={`${styles.categoryCard} ${styles.quickCategoryCard}`}
                                    >
                                        <div className={styles.categoryTitle}>{category.name}</div>
                                        <div className={styles.categoryAction}>
                                            Открыть
                                            <FaArrowRight />
                                        </div>
                                    </Link>
                                )) : (
                                    <div className={styles.emptyState}>Категории появятся после загрузки каталога.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionTop}>
                        <h2 className={styles.sectionTitle}>Основные товарные группы</h2>
                    </div>

                    <div className={styles.cardsGrid}>
                        {PRODUCT_GROUPS.map(({title, text, icon: Icon}) => (
                            <article key={title} className={styles.card}>
                                <div className={styles.cardIcon}><Icon /></div>
                                <div className={styles.cardTitle}>{title}</div>
                                <div className={styles.cardText}>{text}</div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.panel}>
                        <h2 className={styles.sectionTitle}>Чем помогаем</h2>

                        <div className={styles.serviceList}>
                            {SERVICE_ITEMS.map(({title, text, icon: Icon}) => (
                                <div key={title} className={styles.serviceItem}>
                                    <div className={styles.serviceIcon}><Icon /></div>
                                    <div>
                                        <div className={styles.serviceTitle}>{title}</div>
                                        <div className={styles.serviceText}>{text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={`${styles.section} ${styles.contactsSection}`} id="contacts">
                    <div className={styles.contactsPanel}>
                        <h2 className={styles.sectionTitle}>Магазин автоэмалей в Набережных Челнах</h2>
                        <div className={styles.contactFactsRow}>
                            <div className={styles.contactFact}><FaMapMarkerAlt /> Магазин и выдача заказов на месте</div>
                            <div className={styles.contactFact}><FaTruck /> Доставка по городу и по России</div>
                            <div className={styles.contactFact}><FaComments /> Помощь с подбором материалов</div>
                        </div>
                        <div className={styles.contactGrid}>
                            {CONTACT_LINKS.map((item) => (
                                <ContactCard key={item.title} {...item} />
                            ))}
                        </div>
                    </div>
                </section>

                {featuredBrands.length > 0 ? (
                    <section className={styles.section}>
                        <div className={styles.sectionTop}>
                            <h2 className={styles.sectionTitle}>Популярные бренды</h2>
                        </div>

                        <div className={styles.brandCloud}>
                            {featuredBrands.map((brand) => (
                                <Link
                                    key={brand.id}
                                    to={`/catalog?search=${encodeURIComponent(brand.name)}`}
                                    className={styles.brandChip}
                                >
                                    {brand.name}
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
