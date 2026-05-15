import { Router } from 'express';
import crypto from 'node:crypto';
import dayjs from 'dayjs';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scheduleRemindersForAppointment, cancelRemindersForAppointment } from '../services/reminders.js';
import { checkSlotFree } from '../services/availability.js';
import { logAudit } from '../services/audit.js';
import { dispatchWebhooks } from '../services/webhooks.js';
import { partsRouter, laborRouter } from './appointmentExtras.js';
import { mediaRouter } from './appointmentMedia.js';

const router = Router();
router.use(requireAuth);

function apptWebhookSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    start_time: row.start_time,
    end_time: row.end_time,
    customer_id: row.customer_id,
    vehicle_id: row.vehicle_id,
    source: row.source,
  };
}

router.use('/:id/parts', partsRouter);
router.use('/:id/labor', laborRouter);
router.use('/:id/media', mediaRouter);

router.post('/:id/regenerate-public-link', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const tok = crypto.randomBytes(16).toString('hex');
  const r = db.prepare(
    "UPDATE appointments SET public_status_token = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(tok, id);
  if (!r.changes) return res.status(404).json({ error: 'Termin nicht gefunden' });
  logAudit({
    userId: req.user.id,
    action: 'appointment.regenerate_public_link',
    entityType: 'appointment',
    entityId: id,
  });
  res.json({ public_status_token: tok, customer_status_path: `/status/${tok}` });
});

function loadFullAppointment(id) {
  const a = db
    .prepare(
      `SELECT a.*,
              c.first_name, c.last_name, c.email AS customer_email, c.phone AS customer_phone,
              c.whatsapp AS customer_whatsapp,
              v.license_plate, v.brand, v.model, v.year, v.vin, v.mileage,
              u.full_name AS employee_name,
              b.name AS bay_name, b.type AS bay_type
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN users u ON u.id = a.employee_id
       LEFT JOIN bays b ON b.id = a.bay_id
       WHERE a.id = ?`
    )
    .get(id);
  if (!a) return null;
  a.services = db
    .prepare(
      `SELECT asv.id, asv.service_id, asv.price, asv.duration_minutes, asv.quantity,
              s.name, s.category
       FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id
       WHERE asv.appointment_id = ?`
    )
    .all(id);
  a.reminders = db
    .prepare('SELECT * FROM reminders WHERE appointment_id = ? ORDER BY scheduled_at')
    .all(id);
  return a;
}

router.get('/', (req, res) => {
  const { from, to, status, employee_id, customer_id, vehicle_id } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('a.start_time >= ?'); params.push(from); }
  if (to) { where.push('a.start_time <= ?'); params.push(to); }
  if (status) { where.push('a.status = ?'); params.push(status); }
  if (employee_id) { where.push('a.employee_id = ?'); params.push(employee_id); }
  if (customer_id) { where.push('a.customer_id = ?'); params.push(customer_id); }
  if (vehicle_id) { where.push('a.vehicle_id = ?'); params.push(vehicle_id); }

  const rows = db
    .prepare(
      `SELECT a.id, a.start_time, a.end_time, a.status, a.title, a.notes, a.total_price,
              a.customer_id, a.vehicle_id, a.employee_id, a.bay_id,
              a.source, a.confirmation_status, a.external_ref,
              c.first_name, c.last_name,
              v.license_plate, v.brand, v.model,
              u.full_name AS employee_name,
              b.name AS bay_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN users u ON u.id = a.employee_id
       LEFT JOIN bays b ON b.id = a.bay_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.start_time ASC`
    )
    .all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const a = loadFullAppointment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Termin nicht gefunden' });
  res.json(a);
});

function computeTotals(serviceIds = []) {
  if (!serviceIds.length) return { totalPrice: 0, totalDuration: 0, rows: [] };
  const rows = serviceIds.map((item) => {
    const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(item.service_id);
    if (!svc) throw new Error(`Dienstleistung ${item.service_id} nicht gefunden`);
    const quantity = item.quantity || 1;
    return {
      service_id: svc.id,
      price: (item.price ?? svc.price) * quantity,
      duration_minutes: (item.duration_minutes ?? svc.duration_minutes) * quantity,
      quantity,
    };
  });
  return {
    totalPrice: rows.reduce((s, r) => s + r.price, 0),
    totalDuration: rows.reduce((s, r) => s + r.duration_minutes, 0),
    rows,
  };
}

router.post('/', (req, res) => {
  const {
    customer_id, vehicle_id, employee_id = null, bay_id = null,
    start_time, end_time, status = 'geplant',
    title, notes, mileage_at_service,
    services = [],
    reminder_channels = [],
    skip_conflict_check = false,
  } = req.body || {};

  if (!customer_id || !vehicle_id || !start_time) {
    return res.status(400).json({ error: 'Kunde, Fahrzeug und Startzeit sind erforderlich' });
  }

  let totals;
  try {
    totals = computeTotals(services);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const start = dayjs(start_time);
  const end = end_time
    ? dayjs(end_time)
    : start.add(Math.max(totals.totalDuration || 60, 30), 'minute');

  if (!skip_conflict_check && (bay_id || employee_id)) {
    const c = checkSlotFree({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      bay_id, employee_id,
    });
    if (!c.ok) return res.status(409).json({ error: c.reason });
  }

  const statusTok = crypto.randomBytes(16).toString('hex');
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO appointments
         (customer_id, vehicle_id, employee_id, bay_id, start_time, end_time, status,
          title, notes, total_price, mileage_at_service, created_by, source, public_status_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'intern', ?)`
      )
      .run(
        customer_id, vehicle_id, employee_id, bay_id,
        start.toISOString(), end.toISOString(), status,
        title || null, notes || null,
        totals.totalPrice, mileage_at_service || null, req.user.id,
        statusTok
      );

    const appId = info.lastInsertRowid;
    const insSvc = db.prepare(
      `INSERT INTO appointment_services
       (appointment_id, service_id, price, duration_minutes, quantity)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const r of totals.rows) {
      insSvc.run(appId, r.service_id, r.price, r.duration_minutes, r.quantity);
    }
    return appId;
  });

  const id = tx();
  scheduleRemindersForAppointment(id, reminder_channels);
  const created = loadFullAppointment(id);
  logAudit({
    userId: req.user.id,
    action: 'appointment.create',
    entityType: 'appointment',
    entityId: id,
    payload: { status: created.status, start_time: created.start_time },
  });
  dispatchWebhooks('appointment.created', { appointment: apptWebhookSummary(created) });
  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Termin nicht gefunden' });

  const {
    customer_id, vehicle_id, employee_id, bay_id,
    start_time, end_time, status, confirmation_status,
    title, notes, mileage_at_service,
    services, reminder_channels,
    skip_conflict_check = false,
  } = req.body || {};

  let totals = null;
  if (Array.isArray(services)) {
    try {
      totals = computeTotals(services);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const newStart = start_time ? dayjs(start_time) : dayjs(existing.start_time);
  const newEnd = end_time
    ? dayjs(end_time)
    : totals
      ? newStart.add(Math.max(totals.totalDuration || 60, 30), 'minute')
      : dayjs(existing.end_time);

  const newBayId = bay_id === undefined ? existing.bay_id : bay_id;
  const newEmpId = employee_id === undefined ? existing.employee_id : employee_id;

  if (!skip_conflict_check && (start_time || end_time || bay_id !== undefined || employee_id !== undefined)) {
    const c = checkSlotFree({
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      bay_id: newBayId, employee_id: newEmpId,
      appointmentId: existing.id,
    });
    if (!c.ok) return res.status(409).json({ error: c.reason });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE appointments SET
         customer_id=?, vehicle_id=?, employee_id=?, bay_id=?,
         start_time=?, end_time=?, status=?, confirmation_status=?,
         title=?, notes=?, total_price=?, mileage_at_service=?,
         updated_at=datetime('now')
       WHERE id=?`
    ).run(
      customer_id ?? existing.customer_id,
      vehicle_id ?? existing.vehicle_id,
      newEmpId, newBayId,
      newStart.toISOString(),
      newEnd.toISOString(),
      status ?? existing.status,
      confirmation_status ?? existing.confirmation_status,
      title ?? existing.title,
      notes ?? existing.notes,
      totals ? totals.totalPrice : existing.total_price,
      mileage_at_service ?? existing.mileage_at_service,
      existing.id
    );

    if (totals) {
      db.prepare('DELETE FROM appointment_services WHERE appointment_id = ?').run(existing.id);
      const insSvc = db.prepare(
        `INSERT INTO appointment_services
         (appointment_id, service_id, price, duration_minutes, quantity)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const r of totals.rows) {
        insSvc.run(existing.id, r.service_id, r.price, r.duration_minutes, r.quantity);
      }
    }
  });
  tx();

  const updatedRow = db.prepare('SELECT * FROM appointments WHERE id = ?').get(existing.id);
  if (existing.status !== updatedRow.status) {
    dispatchWebhooks('appointment.status_changed', {
      appointment_id: updatedRow.id,
      old_status: existing.status,
      new_status: updatedRow.status,
      reason: 'appointment.update',
    });
  }
  dispatchWebhooks('appointment.updated', { appointment: apptWebhookSummary(updatedRow) });
  logAudit({
    userId: req.user.id,
    action: 'appointment.update',
    entityType: 'appointment',
    entityId: existing.id,
    payload: { fields: Object.keys(req.body || {}) },
  });

  if (Array.isArray(reminder_channels)) {
    cancelRemindersForAppointment(existing.id);
    scheduleRemindersForAppointment(existing.id, reminder_channels);
  } else if (start_time) {
    const pending = db
      .prepare(`SELECT DISTINCT channel FROM reminders WHERE appointment_id = ? AND status = 'geplant'`)
      .all(existing.id)
      .map((r) => r.channel);
    if (pending.length) {
      cancelRemindersForAppointment(existing.id);
      scheduleRemindersForAppointment(existing.id, pending);
    }
  }

  res.json(loadFullAppointment(existing.id));
});

router.patch('/:id/confirm', (req, res) => {
  const before = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  const r = db.prepare(
    `UPDATE appointments SET confirmation_status = 'bestaetigt',
      status = CASE WHEN status = 'geplant' THEN 'bestaetigt' ELSE status END,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const after = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (before.status !== after.status) {
    dispatchWebhooks('appointment.status_changed', {
      appointment_id: after.id,
      old_status: before.status,
      new_status: after.status,
      reason: 'confirm',
    });
  }
  logAudit({
    userId: req.user.id,
    action: 'appointment.confirm',
    entityType: 'appointment',
    entityId: Number(req.params.id),
  });
  res.json(loadFullAppointment(req.params.id));
});

router.get('/pending/list', (_req, res) => {
  const rows = db.prepare(
    `SELECT a.id, a.start_time, a.end_time, a.source, a.total_price,
            c.first_name, c.last_name, c.phone, c.email,
            v.license_plate, v.brand, v.model
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.confirmation_status = 'pending' AND a.status != 'storniert'
     ORDER BY a.start_time`
  ).all();
  res.json(rows);
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  const allowed = ['geplant', 'bestaetigt', 'in_arbeit', 'abgeschlossen', 'storniert'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

  const prevFull = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!prevFull) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const existing = db.prepare('SELECT actual_start_time, actual_end_time FROM appointments WHERE id = ?').get(req.params.id);

  // Zeitstempel automatisch pflegen:
  //   - Wechsel nach 'in_arbeit'  → actual_start_time (falls noch nicht gesetzt)
  //   - Wechsel nach 'abgeschlossen' → actual_end_time
  const fields = ['status=?', "updated_at=datetime('now')"];
  const values = [status];
  if (status === 'in_arbeit' && !existing.actual_start_time) {
    fields.push("actual_start_time=datetime('now')");
  }
  if (status === 'abgeschlossen') {
    if (!existing.actual_start_time) fields.push("actual_start_time=datetime('now')");
    fields.push("actual_end_time=datetime('now')");
  }
  values.push(req.params.id);

  db.prepare(`UPDATE appointments SET ${fields.join(', ')} WHERE id=?`).run(...values);

  if (prevFull.status !== status) {
    dispatchWebhooks('appointment.status_changed', {
      appointment_id: Number(req.params.id),
      old_status: prevFull.status,
      new_status: status,
      reason: 'status_patch',
    });
  }
  logAudit({
    userId: req.user.id,
    action: 'appointment.status_patch',
    entityType: 'appointment',
    entityId: Number(req.params.id),
    payload: { new_status: status },
  });

  if (status === 'storniert' || status === 'abgeschlossen') {
    cancelRemindersForAppointment(req.params.id);
  }
  res.json(loadFullAppointment(req.params.id));
});

router.delete('/:id', (req, res) => {
  const doomed = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!doomed) return res.status(404).json({ error: 'Termin nicht gefunden' });
  cancelRemindersForAppointment(req.params.id);
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  logAudit({
    userId: req.user.id,
    action: 'appointment.delete',
    entityType: 'appointment',
    entityId: Number(req.params.id),
    payload: { had_status: doomed.status },
  });
  dispatchWebhooks('appointment.deleted', {
    appointment_id: doomed.id,
    previous_status: doomed.status,
  });
  res.json({ success: true });
});

router.get('/stats/overview', (req, res) => {
  const today = dayjs().startOf('day').toISOString();
  const tomorrow = dayjs().add(1, 'day').startOf('day').toISOString();
  const weekStart = dayjs().startOf('week').add(1, 'day').toISOString();
  const weekEnd = dayjs(weekStart).add(7, 'day').toISOString();
  const stats = {
    today: db.prepare(
      `SELECT COUNT(*) AS c FROM appointments
       WHERE start_time >= ? AND start_time < ? AND status != 'storniert'`
    ).get(today, tomorrow).c,
    week: db.prepare(
      `SELECT COUNT(*) AS c FROM appointments
       WHERE start_time >= ? AND start_time < ? AND status != 'storniert'`
    ).get(weekStart, weekEnd).c,
    byStatus: db.prepare(
      `SELECT status, COUNT(*) AS c FROM appointments
       WHERE start_time >= date('now','-30 day') GROUP BY status`
    ).all(),
    upcoming: db.prepare(
      `SELECT a.id, a.start_time, a.status, c.first_name, c.last_name,
              v.license_plate, v.brand, v.model
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       WHERE a.start_time >= datetime('now') AND a.status != 'storniert'
       ORDER BY a.start_time LIMIT 10`
    ).all(),
  };
  res.json(stats);
});

export default router;
