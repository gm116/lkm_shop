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

export async function apiGet(path) {
    let res;
    try {
        res = await fetch(buildUrl(path), {
            method: 'GET',
            credentials: 'include',
        });
    } catch (e) {
        throw new Error(e?.message || 'Network error');
    }

    const data = await readJsonSafe(res);

    if (!res.ok) {
        const msg = data?.detail || data?.error || `Request failed: ${res.status}`;
        throw new Error(msg);
    }

    if (data && data.__raw) {
        throw new Error('API returned non-JSON response. Check proxy / API base URL.');
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
        throw new Error(e?.message || 'Network error');
    }

    const data = await readJsonSafe(res);

    if (!res.ok) {
        const msg = data?.detail || data?.error || JSON.stringify(data) || `Request failed: ${res.status}`;
        throw new Error(msg);
    }

    if (data && data.__raw) {
        throw new Error('API returned non-JSON response. Check proxy / API base URL.');
    }

    return data;
}