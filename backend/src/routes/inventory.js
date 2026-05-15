import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_items ORDER BY name').all();
  res.json(rows);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { sku, name, quantity = 0, min_quantity = 0, unit = 'Stk', notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name erforderlich' });
  const info = db.prepare(
    `INSERT INTO inventory_items (sku, name, quantity, min_quantity, unit, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sku || null, name, Number(quantity) || 0, Number(min_quantity) || 0, unit || 'Stk', notes || null);
  res.status(201).json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Nicht gefunden' });
  const { sku, name, quantity, min_quantity, unit, notes } = req.body || {};
  db.prepare(
    `UPDATE inventory_items SET
       sku = COALESCE(?, sku),
       name = COALESCE(?, name),
       quantity = COALESCE(?, quantity),
       min_quantity = COALESCE(?, min_quantity),
       unit = COALESCE(?, unit),
       notes = COALESCE(?, notes),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    sku ?? null, name ?? null,
    quantity != null ? Number(quantity) : null,
    min_quantity != null ? Number(min_quantity) : null,
    unit ?? null, notes ?? null,
    id
  );
  res.json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const r = db.prepare('DELETE FROM inventory_items WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ success: true });
});

export default router;
