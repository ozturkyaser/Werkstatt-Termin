import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateApiKey } from '../services/apiKeys.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function publicView(row) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: JSON.parse(row.scopes || '[]'),
    active: Boolean(row.active),
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
  res.json(rows.map(publicView));
});

router.post('/', (req, res) => {
  const { name, scopes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name ist erforderlich' });
  const allowedScopes = new Set([
    'booking:read', 'booking:create', 'booking:cancel',
    'services:read', 'availability:read',
  ]);
  const effective = Array.isArray(scopes) && scopes.length
    ? scopes.filter((s) => allowedScopes.has(s))
    : ['services:read', 'availability:read', 'booking:create', 'booking:read'];

  const { fullKey, visiblePrefix, hash } = generateApiKey();
  const info = db.prepare(
    `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, active, created_by)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(name, visiblePrefix, hash, JSON.stringify(effective), req.user?.id || null);

  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({
    ...publicView(row),
    api_key: fullKey, // ← wird NUR bei Erstellung zurückgegeben
    warning: 'Dieser Schlüssel wird nur einmal angezeigt. Bitte sicher speichern.',
  });
});

router.patch('/:id', (req, res) => {
  const { active, name } = req.body || {};
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'API-Key nicht gefunden' });
  db.prepare('UPDATE api_keys SET active = ?, name = ? WHERE id = ?')
    .run(active === undefined ? row.active : (active ? 1 : 0), name || row.name, req.params.id);
  res.json(publicView(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
