import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { customer_id, search } = req.query;
  let rows;
  if (customer_id) {
    rows = db
      .prepare(
        `SELECT v.*, c.first_name, c.last_name
         FROM vehicles v JOIN customers c ON c.id = v.customer_id
         WHERE v.customer_id = ? ORDER BY v.created_at DESC`
      )
      .all(customer_id);
  } else if (search) {
    const q = `%${search.toLowerCase()}%`;
    rows = db
      .prepare(
        `SELECT v.*, c.first_name, c.last_name
         FROM vehicles v JOIN customers c ON c.id = v.customer_id
         WHERE lower(v.license_plate) LIKE ? OR lower(v.brand) LIKE ?
            OR lower(v.model) LIKE ? OR lower(v.vin) LIKE ?
         ORDER BY v.license_plate`
      )
      .all(q, q, q, q);
  } else {
    rows = db
      .prepare(
        `SELECT v.*, c.first_name, c.last_name
         FROM vehicles v JOIN customers c ON c.id = v.customer_id
         ORDER BY v.license_plate`
      )
      .all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const v = db
    .prepare(
      `SELECT v.*, c.first_name, c.last_name, c.email, c.phone
       FROM vehicles v JOIN customers c ON c.id = v.customer_id
       WHERE v.id = ?`
    )
    .get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
  const history = db
    .prepare(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.notes, a.total_price,
              a.mileage_at_service,
              GROUP_CONCAT(s.name, ', ') AS services
       FROM appointments a
       LEFT JOIN appointment_services asv ON asv.appointment_id = a.id
       LEFT JOIN services s ON s.id = asv.service_id
       WHERE a.vehicle_id = ?
       GROUP BY a.id
       ORDER BY a.start_time DESC`
    )
    .all(req.params.id);
  res.json({ ...v, history });
});

router.post('/', (req, res) => {
  const {
    customer_id, license_plate, brand, model, year, vin, mileage, fuel_type, color, notes,
  } = req.body || {};
  if (!customer_id || !license_plate) {
    return res.status(400).json({ error: 'Kunde und Kennzeichen sind erforderlich' });
  }
  const info = db
    .prepare(
      `INSERT INTO vehicles
       (customer_id, license_plate, brand, model, year, vin, mileage, fuel_type, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customer_id,
      license_plate.toUpperCase().trim(),
      brand?.trim() || null,
      model?.trim() || null,
      year || null,
      vin?.trim() || null,
      mileage || null,
      fuel_type || null,
      color || null,
      notes || null
    );
  res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
  const {
    license_plate, brand, model, year, vin, mileage, fuel_type, color, notes,
  } = req.body || {};
  db.prepare(
    `UPDATE vehicles SET license_plate=?, brand=?, model=?, year=?, vin=?, mileage=?,
                        fuel_type=?, color=?, notes=? WHERE id=?`
  ).run(
    (license_plate ?? existing.license_plate)?.toUpperCase(),
    brand ?? existing.brand,
    model ?? existing.model,
    year ?? existing.year,
    vin ?? existing.vin,
    mileage ?? existing.mileage,
    fuel_type ?? existing.fuel_type,
    color ?? existing.color,
    notes ?? existing.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c FROM appointments
       WHERE vehicle_id = ? AND status NOT IN ('abgeschlossen','storniert')`
    )
    .get(req.params.id).c;
  if (active > 0) {
    return res
      .status(409)
      .json({ error: 'Fahrzeug hat aktive Termine und kann nicht gelöscht werden' });
  }
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
