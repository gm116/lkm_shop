export const LEGAL_DOCUMENTS = {
    privacy: {
        title: 'Политика конфиденциальности',
        filename: 'privacy.md',
    },
    offer: {
        title: 'Публичная оферта',
        filename: 'offer.md',
    },
    terms: {
        title: 'Пользовательское соглашение',
        filename: 'terms.md',
    },
    'delivery-payment': {
        title: 'Доставка и оплата',
        filename: 'delivery-payment.md',
    },
    returns: {
        title: 'Возврат и обмен',
        filename: 'returns.md',
    },
};

export function getLegalDocumentTitle(slug) {
    return LEGAL_DOCUMENTS[slug]?.title || 'Документ';
}

export async function getLegalDocument(slug) {
    const meta = LEGAL_DOCUMENTS[slug];
    if (!meta) {
        throw new Error('Документ не найден');
    }

    const response = await fetch(`/legal-docs/${meta.filename}`, {
        method: 'GET',
        cache: 'no-cache',
    });

    if (!response.ok) {
        throw new Error('Документ не загружен');
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const normalizedBody = body.trim().toLowerCase();

    if (
        !body.trim()
        || contentType.includes('text/html')
        || normalizedBody.startsWith('<!doctype html')
        || normalizedBody.startsWith('<html')
    ) {
        throw new Error('Документ не загружен');
    }

    return {
        slug,
        title: meta.title,
        body,
        updated_at: null,
    };
}
