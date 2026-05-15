import crypto from 'node:crypto';
import db from '../db.js';

function signBody(secret, body) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Sendet Payload an alle passenden, aktiven Webhooks (nicht blockierend).
 */
export function dispatchWebhooks(event, payload) {
  const hooks = db.prepare('SELECT id, url, secret, events, active FROM webhooks WHERE active = 1').all();
  const matches = parseEvents; // not used per-hook - each hook has own events string
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), ...payload });

  for (const h of hooks) {
    const allow = (() => {
      const s = (h.events || '*').trim();
      if (s === '*' || !s) return true;
      return s.split(',').map((x) => x.trim()).includes(event);
    })();
    if (!allow) continue;

    const sig = signBody(h.secret, body);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Werkstatt-Termin-Webhooks/1.0',
    };
    if (sig) headers['X-Webhook-Signature'] = `sha256=${sig}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    void fetch(h.url, { method: 'POST', headers, body, signal: ac.signal })
      .finally(() => clearTimeout(timer))
      .catch((err) => console.error(`[webhook ${h.id}]`, err.message));
  }
}
