function buildUrl(path) {
    const base = process.env.REACT_APP_API_BASE || '';
    if (!base) return path;

    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
}

async function readJsonSafe(res) {
    const text = await res.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (e) {
        return {__raw: text};
    }
}

function flattenMessages(value) {
    if (value == null) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) {
        return value.flatMap(flattenMessages);
    }
    if (typeof value === 'object') {
        return Object.values(value).flatMap(flattenMessages);
    }
    return [String(value)];
}

function extractErrorMessage(data, status) {
    const message = data?.detail || data?.error;
    if (message) return String(message);

    const flattened = Array.from(new Set(flattenMessages(data).filter(Boolean)));
    if (flattened.length) return flattened.join(' ');

    return `Ошибка запроса: ${status}`;
}

export async function apiGet(path) {
    let res;
    try {
        res = await fetch(buildUrl(path), {
            method: 'GET',
            credentials: 'include',
        });
    } catch (e) {
        throw new Error(e?.message || 'Ошибка сети');
    }

    const data = await readJsonSafe(res);

    if (!res.ok) {
        const msg = extractErrorMessage(data, res.status);
        throw new Error(msg);
    }

    if (data && data.__raw) {
        throw new Error('API вернул не-JSON ответ. Проверь прокси и базовый URL API.');
    }

    return data;
}

export async function apiPost(path, body) {
    let res;
    try {
        res = await fetch(buildUrl(path), {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
    } catch (e) {
        throw new Error(e?.message || 'Ошибка сети');
    }

    const data = await readJsonSafe(res);

    if (!res.ok) {
        const msg = extractErrorMessage(data, res.status);
        throw new Error(msg);
    }

    if (data && data.__raw) {
        throw new Error('API вернул не-JSON ответ. Проверь прокси и базовый URL API.');
    }

    return data;
}
