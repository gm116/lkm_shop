import {Link, useNavigate, useLocation} from 'react-router-dom';
import {FaSearch, FaShoppingBasket, FaUser, FaBoxOpen, FaSignOutAlt, FaChartBar, FaCog} from 'react-icons/fa';
import {useCart} from '../store/cartContext';
import {useAuth} from '../store/authContext';
import styles from '../styles/Header.module.css';
import {useEffect, useMemo, useRef} from 'react';

export default function Header() {
    const navigate = useNavigate();
    const location = useLocation();

    const searchInput = useRef(null);

    const {cart} = useCart();
    const {isAuthenticated, logout, permissions, loading} = useAuth();
    const isStaff =
        !!permissions?.is_superuser ||
        !!permissions?.is_staff ||
        (Array.isArray(permissions?.groups) && permissions.groups.includes('warehouse'));
    const isAdmin = !!permissions?.is_superuser || !!permissions?.is_staff;

    const cartCount = useMemo(() => {
        return cart.reduce((sum, item) => sum + Number(item.count || 0), 0);
    }, [cart]);

    useEffect(() => {
        const qs = new URLSearchParams(location.search);
        const q = qs.get('search') || '';
        if (searchInput.current) {
            searchInput.current.value = q;
        }
    }, [location.pathname, location.search]);

    const handleLogoClick = (e) => {
        e.preventDefault();
        navigate('/catalog');
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const v = (searchInput.current?.value || '').trim();
        const qs = v ? `?search=${encodeURIComponent(v)}` : '';
        navigate(`/catalog${qs}`);
    };

    const handleLogout = async () => {
        await logout({silent: false});
        navigate('/login');
    };

    const showAuthLoading = loading && isAuthenticated;

    return (
        <header className={styles.headerOuter}>
            <div className={styles.header}>
                <div className={styles.left}>
                    <a href="/catalog" className={styles.logo} onClick={handleLogoClick}>
                        ВсеЭмалиРу
                    </a>
                </div>

                <div className={styles.center}>
                    <form className={styles.searchBox} onSubmit={handleSearch}>
                        <input
                            ref={searchInput}
                            type="text"
                            placeholder="Поиск по товарам"
                            className={styles.searchInput}
                        />
                        <button className={styles.searchBtn} type="submit" aria-label="Поиск">
                            <FaSearch/>
                        </button>
                    </form>
                </div>

                <div className={styles.right}>
                    {showAuthLoading ? (
                        <div className={styles.rightLoading} aria-hidden="true">
                            {[0, 1, 2].map((idx) => (
                                <span className={`${styles.iconBtn} ${styles.iconBtnSkeleton}`} key={`hdr-sk-${idx}`}>
                                    <span className={styles.iconCircleSkeleton}/>
                                    <span className={styles.iconLabelSkeleton}/>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <>
                            {!isStaff && (
                                <>
                                    <Link to="/cart" className={styles.iconBtn}>
                                        <span className={styles.iconCircle} aria-hidden="true">
                                            <FaShoppingBasket size={18}/>
                                        </span>
                                        {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
                                        <span className={styles.iconLabel}>Корзина</span>
                                    </Link>
                                </>
                            )}

                            {isAuthenticated ? (
                                <>
                                    {!isStaff && (
                                        <Link to="/profile" className={styles.iconBtn}>
                                            <span className={styles.iconCircle} aria-hidden="true">
                                                <FaUser size={18}/>
                                            </span>
                                            <span className={styles.iconLabel}>Профиль</span>
                                        </Link>
                                    )}
                                    {isStaff && (
                                        <>
                                            {isAdmin && (
                                                <Link to="/admin" className={styles.iconBtn}>
                                                    <span className={styles.iconCircle} aria-hidden="true">
                                                        <FaCog size={18}/>
                                                    </span>
                                                    <span className={styles.iconLabel}>Управление</span>
                                                </Link>
                                            )}
                                            <Link to="/staff/orders" className={styles.iconBtn}>
                                                <span className={styles.iconCircle} aria-hidden="true">
                                                    <FaBoxOpen size={18}/>
                                                </span>
                                                <span className={styles.iconLabel}>Сборка</span>
                                            </Link>
                                            <Link to="/staff/analytics" className={styles.iconBtn}>
                                                <span className={styles.iconCircle} aria-hidden="true">
                                                    <FaChartBar size={18}/>
                                                </span>
                                                <span className={styles.iconLabel}>Аналитика</span>
                                            </Link>
                                        </>
                                    )}
                                    <button
                                        className={`${styles.iconBtn} ${styles.iconBtnButton}`}
                                        onClick={handleLogout}
                                        type="button"
                                    >
                                        <span className={styles.iconCircle} aria-hidden="true">
                                            <FaSignOutAlt size={18}/>
                                        </span>
                                        <span className={styles.iconLabel}>Выйти</span>
                                    </button>
                                </>
                            ) : (
                                <Link to="/login" className={styles.iconBtn}>
                                    <span className={styles.iconCircle} aria-hidden="true">
                                        <FaUser size={18}/>
                                    </span>
                                    <span className={styles.iconLabel}>Войти</span>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
