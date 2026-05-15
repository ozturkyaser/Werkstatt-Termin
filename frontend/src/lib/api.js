const TOKEN_KEY = 'werkstatt_token';

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

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
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
