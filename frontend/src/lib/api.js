const TOKEN_KEY = 'werkstatt_token';

/** Optional für getrennte Hosts (z. B. App Platform: Frontend-App + Backend-App). Ohne Prefix: gleiche Origin wie SPA (Docker/Nginx). */
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');

/**
 * Absolute URL für Pfade unter /api/… für fetch/link.
 * Bei Docker mit Nginx: VITE_API_ORIGIN leer lassen → relative URLs.
 */
export function apiAbsoluteUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${p}` : p;
}

/** Widget + Public-API: wie deployt – bei separater API immer Backend-Origin. */
export function getAssetsOrigin() {
  if (typeof window === 'undefined') return API_ORIGIN || '';
  return API_ORIGIN ? API_ORIGIN : window.location.origin;
}

export function getPublicApiBase() {
  return `${getAssetsOrigin()}/api/public`;
}

/** True wenn /api fälschlich die SPA (index.html) liefert – z. B. nur „serve“ ohne Backend. */
export function isLikelyHtmlApiResponse(contentType, bodyText) {
  const ct = contentType || '';
  const t = (bodyText || '').trimStart();
  return ct.includes('text/html') || t.startsWith('<!DOCTYPE') || t.startsWith('<html');
}

const MSG_NO_BACKEND = `Kein API-Server: Antworten kommen von der Web-Oberfläche (HTML), nicht vom Backend. Deployen Sie das Backend (Node) und/oder setzen Sie in der Build-Umgebung VITE_API_ORIGIN auf die öffentliche Backend-URL.`;

const MSG_BACKEND_URL_WRONG =
  'API liefert HTML statt JSON – Backend-URL prüfen (VITE_API_ORIGIN) und CORS (FRONTEND_URL) am Server.';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiAbsoluteUrl(`/api${path}`), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (isLikelyHtmlApiResponse(res.headers.get('content-type'), text)) {
    throw new Error(API_ORIGIN ? MSG_BACKEND_URL_WRONG : MSG_NO_BACKEND);
  }

  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;

  if (!res.ok) {
    const message = (data && data.error) || res.statusText || 'Fehler';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body) => request('POST', p, body),
  put: (p, body) => request('PUT', p, body),
  patch: (p, body) => request('PATCH', p, body),
  del: (p) => request('DELETE', p),
};

export function formatCurrency(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Number(n || 0)
  );
}

export const STATUS_LABELS = {
  geplant: 'Geplant',
  bestaetigt: 'Bestätigt',
  in_arbeit: 'In Arbeit',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};
