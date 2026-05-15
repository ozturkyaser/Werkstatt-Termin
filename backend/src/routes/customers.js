import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { search } = req.query;
  let rows;
  if (search) {
    const q = `%${search.toLowerCase()}%`;
    rows = db
      .prepare(
        `SELECT * FROM customers
         WHERE lower(first_name) LIKE ? OR lower(last_name) LIKE ?
            OR lower(email) LIKE ? OR lower(phone) LIKE ?
         ORDER BY last_name, first_name`
      )
      .all(q, q, q, q);
  } else {
    rows = db.prepare('SELECT * FROM customers ORDER BY last_name, first_name').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  const vehicles = db
    .prepare('SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC')
    .all(customer.id);
  const appointments = db
    .prepare(
      `SELECT a.*, v.license_plate, v.brand, v.model
       FROM appointments a
       JOIN vehicles v ON v.id = a.vehicle_id
       WHERE a.customer_id = ?
       ORDER BY a.start_time DESC
       LIMIT 100`
    )
    .all(customer.id);
  res.json({ ...customer, vehicles, appointments });
});

router.post('/', (req, res) => {
  const { first_name, last_name, email, phone, whatsapp, address, notes } = req.body || {};
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Vor- und Nachname sind erforderlich' });
  }
  const info = db
    .prepare(
      `INSERT INTO customers (first_name, last_name, email, phone, whatsapp, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      first_name.trim(),
      last_name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      whatsapp?.trim() || null,
      address?.trim() || null,
      notes?.trim() || null
    );
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(customer);
});

router.put('/:id', (req, res) => {
  const { first_name, last_name, email, phone, whatsapp, address, notes } = req.body || {};
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  db.prepare(
    `UPDATE customers
     SET first_name = ?, last_name = ?, email = ?, phone = ?, whatsapp = ?,
         address = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    first_name ?? existing.first_name,
    last_name ?? existing.last_name,
    email ?? existing.email,
    phone ?? existing.phone,
    whatsapp ?? existing.whatsapp,
    address ?? existing.address,
    notes ?? existing.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c FROM appointments
       WHERE customer_id = ? AND status NOT IN ('abgeschlossen','storniert')`
    )
    .get(req.params.id).c;
  if (active > 0) {
    return res
      .status(409)
      .json({ error: 'Kunde hat noch aktive Termine und kann nicht gelöscht werden' });
  }
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
