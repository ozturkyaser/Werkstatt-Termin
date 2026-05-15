import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM bays ORDER BY sort_order, id').all());
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, type = 'hebebuehne', description, active = 1, sort_order = 0 } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name ist erforderlich' });
  const info = db.prepare(
    `INSERT INTO bays (name, type, description, active, sort_order) VALUES (?, ?, ?, ?, ?)`
  ).run(name, type, description || null, active ? 1 : 0, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM bays WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const b = db.prepare('SELECT * FROM bays WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Bühne nicht gefunden' });
  const { name, type, description, active, sort_order } = req.body || {};
  db.prepare(
    `UPDATE bays SET name = ?, type = ?, description = ?, active = ?, sort_order = ? WHERE id = ?`
  ).run(
    name ?? b.name,
    type ?? b.type,
    description ?? b.description,
    active === undefined ? b.active : (active ? 1 : 0),
    sort_order ?? b.sort_order,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM bays WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const inUse = db.prepare(
    `SELECT COUNT(*) AS c FROM appointments
     WHERE bay_id = ? AND status NOT IN ('abgeschlossen','storniert')`
  ).get(req.params.id).c;
  if (inUse > 0) {
    return res.status(409).json({ error: 'Bühne hat aktive Termine – bitte deaktivieren statt löschen.' });
  }
  db.prepare('DELETE FROM bays WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
