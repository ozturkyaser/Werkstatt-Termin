import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { dispatchWebhooks } from '../services/webhooks.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT id, url, description, events, active, created_at FROM webhooks ORDER BY id DESC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { url, description = null, secret = null, events = '*', active = true } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url erforderlich' });
  try {
    void new URL(url);
  } catch {
    return res.status(400).json({ error: 'Ungültige URL' });
  }
  const info = db.prepare(
    `INSERT INTO webhooks (url, description, secret, events, active)
     VALUES (?, ?, ?, ?, ?)`
  ).run(url, description, secret, events, active ? 1 : 0);
  res.status(201).json(db.prepare('SELECT id, url, description, events, active, created_at FROM webhooks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Nicht gefunden' });
  const { url, description, secret, events, active } = req.body || {};
  if (url !== undefined) {
    try {
      void new URL(url);
    } catch {
      return res.status(400).json({ error: 'Ungültige URL' });
    }
  }
  db.prepare(
    `UPDATE webhooks SET
       url = COALESCE(?, url),
       description = COALESCE(?, description),
       secret = COALESCE(?, secret),
       events = COALESCE(?, events),
       active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    url ?? null,
    description ?? null,
    secret ?? null,
    events ?? null,
    active !== undefined ? (active ? 1 : 0) : null,
    id
  );
  res.json(db.prepare('SELECT id, url, description, events, active, created_at FROM webhooks WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/test', (req, res) => {
  const h = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(req.params.id);
  if (!h) return res.status(404).json({ error: 'Nicht gefunden' });
  dispatchWebhooks('webhook.test', { message: 'Test von Werkstatt-Termin', webhook_id: h.id });
  res.json({ ok: true, message: 'Test-Event wurde in die Warteschlange gegeben (asynchron).' });
});

export default router;
