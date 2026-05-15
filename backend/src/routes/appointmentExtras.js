import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const partsRouter = Router({ mergeParams: true });
partsRouter.use(requireAuth);

partsRouter.get('/', (req, res) => {
  const aid = Number(req.params.id);
  const rows = db.prepare(
    'SELECT * FROM appointment_parts WHERE appointment_id = ? ORDER BY id'
  ).all(aid);
  res.json(rows);
});

partsRouter.post('/', (req, res) => {
  const aid = Number(req.params.id);
  const ap = db.prepare('SELECT id FROM appointments WHERE id = ?').get(aid);
  if (!ap) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const { part_number, description, quantity = 1, unit_price = 0, supplier, notes } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description erforderlich' });
  const info = db.prepare(
    `INSERT INTO appointment_parts (appointment_id, part_number, description, quantity, unit_price, supplier, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(aid, part_number || null, description, Number(quantity) || 1, Number(unit_price) || 0, supplier || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM appointment_parts WHERE id = ?').get(info.lastInsertRowid));
});

partsRouter.put('/:partId', (req, res) => {
  const pid = Number(req.params.partId);
  const row = db.prepare('SELECT * FROM appointment_parts WHERE id = ?').get(pid);
  if (!row || row.appointment_id !== Number(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
  const { part_number, description, quantity, unit_price, supplier, notes } = req.body || {};
  db.prepare(
    `UPDATE appointment_parts SET
       part_number = COALESCE(?, part_number),
       description = COALESCE(?, description),
       quantity = COALESCE(?, quantity),
       unit_price = COALESCE(?, unit_price),
       supplier = COALESCE(?, supplier),
       notes = COALESCE(?, notes)
     WHERE id = ?`
  ).run(
    part_number ?? null,
    description ?? null,
    quantity != null ? Number(quantity) : null,
    unit_price != null ? Number(unit_price) : null,
    supplier ?? null,
    notes ?? null,
    pid
  );
  res.json(db.prepare('SELECT * FROM appointment_parts WHERE id = ?').get(pid));
});

partsRouter.delete('/:partId', (req, res) => {
  const pid = Number(req.params.partId);
  const row = db.prepare('SELECT * FROM appointment_parts WHERE id = ?').get(pid);
  if (!row || row.appointment_id !== Number(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('DELETE FROM appointment_parts WHERE id = ?').run(pid);
  res.json({ success: true });
});

export const laborRouter = Router({ mergeParams: true });
laborRouter.use(requireAuth);

laborRouter.get('/', (req, res) => {
  const aid = Number(req.params.id);
  const rows = db.prepare(
    `SELECT l.*, u.full_name AS user_name
       FROM appointment_labor_logs l
       JOIN users u ON u.id = l.user_id
      WHERE l.appointment_id = ?
      ORDER BY l.started_at DESC`
  ).all(aid);
  res.json(rows);
});

laborRouter.post('/start', (req, res) => {
  const aid = Number(req.params.id);
  const ap = db.prepare('SELECT id FROM appointments WHERE id = ?').get(aid);
  if (!ap) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const { note } = req.body || {};
  const uid = req.user?.id;
  if (!uid) return res.status(401).json({ error: 'Nicht authentifiziert' });
  const open = db.prepare(
    `SELECT id FROM appointment_labor_logs WHERE appointment_id = ? AND user_id = ? AND ended_at IS NULL`
  ).get(aid, uid);
  if (open) return res.status(409).json({ error: 'Für Sie läuft bereits eine Zeiterfassung. Bitte zuerst beenden.' });
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO appointment_labor_logs (appointment_id, user_id, started_at, note)
     VALUES (?, ?, ?, ?)`
  ).run(aid, uid, now, note || null);
  res.status(201).json(db.prepare(
    `SELECT l.*, u.full_name AS user_name FROM appointment_labor_logs l JOIN users u ON u.id = l.user_id WHERE l.id = ?`
  ).get(info.lastInsertRowid));
});

laborRouter.post('/stop', (req, res) => {
  const aid = Number(req.params.id);
  const uid = req.user?.id;
  const open = db.prepare(
    `SELECT * FROM appointment_labor_logs WHERE appointment_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY id DESC`
  ).get(aid, uid);
  if (!open) return res.status(404).json({ error: 'Keine laufende Zeiterfassung' });
  const now = new Date().toISOString();
  db.prepare('UPDATE appointment_labor_logs SET ended_at = ? WHERE id = ?').run(now, open.id);
  res.json(db.prepare(
    `SELECT l.*, u.full_name AS user_name FROM appointment_labor_logs l JOIN users u ON u.id = l.user_id WHERE l.id = ?`
  ).get(open.id));
});

laborRouter.delete('/:logId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur Admin' });
  const lid = Number(req.params.logId);
  const row = db.prepare('SELECT * FROM appointment_labor_logs WHERE id = ?').get(lid);
  if (!row || row.appointment_id !== Number(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('DELETE FROM appointment_labor_logs WHERE id = ?').run(lid);
  res.json({ success: true });
});
