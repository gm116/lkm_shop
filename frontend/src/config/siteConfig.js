const env = process.env;

function normalizeUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    return value;
}

export const siteConfig = {
    storeName: env.REACT_APP_STORE_NAME || 'Магазин',
    contactEmail: env.REACT_APP_CONTACT_EMAIL || 'info@example.com',
    contactPhone: env.REACT_APP_CONTACT_PHONE || '+7 (000) 000-00-00',
    contactCity: env.REACT_APP_CONTACT_CITY || 'Москва',
    workHours: env.REACT_APP_WORK_HOURS || 'Пн–Пт · 08:00–17:00',
    links: {
        twoGis: normalizeUrl(env.REACT_APP_LINK_2GIS),
        yandexMaps: normalizeUrl(env.REACT_APP_LINK_YANDEX_MAPS),
        telegram: normalizeUrl(env.REACT_APP_LINK_TELEGRAM),
        whatsapp: normalizeUrl(env.REACT_APP_LINK_WHATSAPP),
        ozon: normalizeUrl(env.REACT_APP_LINK_OZON),
    },
};

