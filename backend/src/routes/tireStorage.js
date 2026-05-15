import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { customer_id, vehicle_id, active } = req.query;
  const where = [];
  const params = [];
  if (customer_id) { where.push('t.customer_id = ?'); params.push(Number(customer_id)); }
  if (vehicle_id) { where.push('t.vehicle_id = ?'); params.push(Number(vehicle_id)); }
  if (active === '1' || active === 'true') where.push('t.active = 1');
  if (active === '0' || active === 'false') where.push('t.active = 0');
  const sql = `
    SELECT t.*, c.first_name, c.last_name, v.license_plate, v.brand, v.model
      FROM tire_storage t
      JOIN customers c ON c.id = t.customer_id
      JOIN vehicles v ON v.id = t.vehicle_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY t.active DESC, t.updated_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT t.*, c.first_name, c.last_name, v.license_plate, v.brand, v.model
       FROM tire_storage t
       JOIN customers c ON c.id = t.customer_id
       JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(row);
});

router.post('/', (req, res) => {
  const {
    customer_id, vehicle_id, lagertyp, lagerort, quantity = 4,
    einlagerdatum, bemerkung, active = true,
  } = req.body || {};
  if (!customer_id || !vehicle_id || !lagertyp) {
    return res.status(400).json({ error: 'customer_id, vehicle_id und lagertyp (winter|sommer) erforderlich' });
  }
  if (!['winter', 'sommer'].includes(lagertyp)) return res.status(400).json({ error: 'lagertyp ungültig' });
  const info = db.prepare(
    `INSERT INTO tire_storage (customer_id, vehicle_id, lagertyp, lagerort, quantity, einlagerdatum, bemerkung, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    customer_id, vehicle_id, lagertyp, lagerort || null, Number(quantity) || 4,
    einlagerdatum || new Date().toISOString().slice(0, 10),
    bemerkung || null,
    active ? 1 : 0
  );
  res.status(201).json(db.prepare('SELECT * FROM tire_storage WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM tire_storage WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Nicht gefunden' });
  const {
    lagertyp, lagerort, quantity, einlagerdatum, bemerkung, active,
    last_winter_reminder_year, last_summer_reminder_year,
  } = req.body || {};
  db.prepare(
    `UPDATE tire_storage SET
       lagertyp = COALESCE(?, lagertyp),
       lagerort = COALESCE(?, lagerort),
       quantity = COALESCE(?, quantity),
       einlagerdatum = COALESCE(?, einlagerdatum),
       bemerkung = COALESCE(?, bemerkung),
       active = COALESCE(?, active),
       last_winter_reminder_year = COALESCE(?, last_winter_reminder_year),
       last_summer_reminder_year = COALESCE(?, last_summer_reminder_year),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    lagertyp ?? null,
    lagerort !== undefined ? lagerort : null,
    quantity != null ? Number(quantity) : null,
    einlagerdatum ?? null,
    bemerkung !== undefined ? bemerkung : null,
    active !== undefined ? (active ? 1 : 0) : null,
    last_winter_reminder_year != null ? Number(last_winter_reminder_year) : null,
    last_summer_reminder_year != null ? Number(last_summer_reminder_year) : null,
    id
  );
  res.json(db.prepare(
    `SELECT t.*, c.first_name, c.last_name, v.license_plate, v.brand, v.model
       FROM tire_storage t
       JOIN customers c ON c.id = t.customer_id
       JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.id = ?`
  ).get(id));
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM tire_storage WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ success: true });
});

export default router;
