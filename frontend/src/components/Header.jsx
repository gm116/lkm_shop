import {Link, useNavigate} from 'react-router-dom';
import {FaSearch, FaShoppingBasket, FaHeart, FaUser} from 'react-icons/fa';
import styles from '../styles/Header.module.css';
import {useRef} from 'react';

export default function Header({cartCount = 0, favoriteCount = 0}) {
    const navigate = useNavigate();
    const searchInput = useRef(null);

    const handleLogoClick = (e) => {
        e.preventDefault();
        navigate('/catalog');
    };

    const handleSearch = (e) => {
        e.preventDefault();
        navigate('/catalog');
    };

    return (
        <header className={styles.headerOuter}>
            <div className={styles.header}>
                <div className={styles.left}>
                    <a href="/catalog" className={styles.logo} onClick={handleLogoClick}>
                        Магазин
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
                        <button className={styles.searchBtn} type="submit">
                            <FaSearch/>
                        </button>
                    </form>
                </div>
                <div className={styles.right}>
                    <Link to="/cart" className={styles.iconBtn}>
                        <FaShoppingBasket size={22}/>
                        {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
                        <span className={styles.iconLabel}>Корзина</span>
                    </Link>
                    <Link to="/favorites" className={styles.iconBtn}>
                        <FaHeart size={22}/>
                        {favoriteCount > 0 && <span className={styles.badge}>{favoriteCount}</span>}
                        <span className={styles.iconLabel}>Избранное</span>
                    </Link>
                    <Link to="/profile" className={styles.iconBtn}>
                        <FaUser size={22}/>
                        <span className={styles.iconLabel}>Профиль</span>
                    </Link>
                </div>
            </div>
        </header>
    );
}