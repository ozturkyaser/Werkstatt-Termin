import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import dayjs from 'dayjs';
import { requireApiKey } from '../middleware/apiKey.js';
import { findAvailability, checkSlotFree } from '../services/availability.js';
import { getSetting } from '../services/settings.js';
import { scheduleRemindersForAppointment } from '../services/reminders.js';
import { dispatchWebhooks } from '../services/webhooks.js';

const router = Router();

// ---------- Öffentlicher Auftragsstatus (Link für Kunden, kein API-Key) ----------

router.get('/appointment-status/:token', (req, res) => {
  const token = String(req.params.token || '').replace(/[^a-f0-9]/gi, '');
  if (token.length < 16) return res.status(400).json({ error: 'Ungültiger Link' });
  const a = db.prepare(
    `SELECT a.id, a.status, a.start_time, a.end_time, a.title, a.confirmation_status,
            v.license_plate, v.brand, v.model,
            c.first_name, c.last_name
       FROM appointments a
       JOIN vehicles v ON v.id = a.vehicle_id
       JOIN customers c ON c.id = a.customer_id
      WHERE a.public_status_token = ?`
  ).get(token);
  if (!a) return res.status(404).json({ error: 'Link ungültig oder abgelaufen' });
  res.json({
    id: a.id,
    status: a.status,
    confirmation_status: a.confirmation_status,
    start_time: a.start_time,
    end_time: a.end_time,
    title: a.title,
    vehicle: {
      license_plate: a.license_plate,
      brand: a.brand,
      model: a.model,
    },
    customer: {
      first_name: a.first_name,
      last_name: a.last_name,
    },
  });
});

// ---------- Öffentliche Leistungen (keine inaktiven/nicht buchbaren) ----------

router.get('/services', requireApiKey('services:read'), (_req, res) => {
  const rows = db.prepare(
    `SELECT id, name, description, category, duration_minutes, buffer_minutes,
            price, required_bay_type, required_skills
     FROM services WHERE active = 1 AND online_bookable = 1
     ORDER BY category, name`
  ).all();
  res.json(rows.map((s) => ({
    ...s,
    required_skills: s.required_skills ? JSON.parse(s.required_skills) : [],
  })));
});

// ---------- Verfügbare Slots ----------

router.get('/availability', requireApiKey('availability:read'), (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) erforderlich' });

  const minLead = Number(getSetting('booking_min_lead_hours') || 2);
  const maxAhead = Number(getSetting('booking_max_days_ahead') || 60);
  const today = dayjs();
  const target = dayjs(date);
  if (!target.isValid()) return res.status(400).json({ error: 'Ungültiges Datum' });
  if (target.isBefore(today, 'day'))
    return res.status(400).json({ error: 'Datum liegt in der Vergangenheit' });
  if (target.diff(today, 'day') > maxAhead)
    return res.status(400).json({ error: `Datum liegt zu weit in der Zukunft (max. ${maxAhead} Tage)` });

  const serviceIds = (req.query.service_ids || '').toString().split(',')
    .filter(Boolean).map((x) => Number(x));
  const result = findAvailability({ date: String(date), service_ids: serviceIds });

  // Mindestvorlauf anwenden und interne Infos (Mitarbeiter/Bühne) entfernen
  const minStart = dayjs().add(minLead, 'hour');
  const slots = result.slots
    .filter((s) => dayjs(s.start_time).isAfter(minStart))
    .map((s) => ({
      start_time: s.start_time,
      end_time: s.end_time,
      duration_minutes: s.duration_minutes,
    }));

  res.json({
    date: result.day.date,
    closed: result.day.closed,
    closure_reason: result.day.closure_reason,
    slots,
  });
});

// ---------- Online-Buchung anlegen ----------

router.post('/bookings', requireApiKey('booking:create'), (req, res) => {
  const {
    customer = {},          // {first_name, last_name, email, phone, address}
    vehicle = {},           // {license_plate, brand, model, year, vin}
    service_ids = [],
    start_time,             // ISO
    notes,
    source,                 // optional override: 'online' | 'telefon_ki' | 'api'
  } = req.body || {};

  if (!start_time) return res.status(400).json({ error: 'start_time ist erforderlich' });
  if (!Array.isArray(service_ids) || service_ids.length === 0)
    return res.status(400).json({ error: 'service_ids[] erforderlich' });
  const customerName = customer.full_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  if (!customerName || (!customer.phone && !customer.email))
    return res.status(400).json({ error: 'Kunde: Name + (phone oder email) erforderlich' });
  // Vor- und Nachname extrahieren
  let firstName = customer.first_name, lastName = customer.last_name;
  if (!firstName && !lastName && customerName) {
    const parts = customerName.split(/\s+/);
    firstName = parts[0] || 'Kunde';
    lastName = parts.slice(1).join(' ') || '-';
  }
  if (!vehicle.license_plate)
    return res.status(400).json({ error: 'Fahrzeug: license_plate erforderlich' });

  const services = db.prepare(
    `SELECT * FROM services WHERE id IN (${service_ids.map(() => '?').join(',')})
     AND active = 1 AND online_bookable = 1`
  ).all(...service_ids);
  if (services.length !== service_ids.length)
    return res.status(400).json({ error: 'Eine oder mehrere Leistungen nicht buchbar' });

  const totalDuration = services.reduce((s, x) => s + x.duration_minutes, 0);
  const totalBuffer = services.reduce((s, x) => s + (x.buffer_minutes || 0), 0);
  const totalPrice = services.reduce((s, x) => s + (x.price || 0), 0);

  const start = dayjs(start_time);
  const end = start.add(totalDuration + totalBuffer, 'minute');

  // Slot verfügbar prüfen
  const dateStr = start.format('YYYY-MM-DD');
  const avail = findAvailability({ date: dateStr, service_ids });
  const matchingSlot = avail.slots.find((s) =>
    dayjs(s.start_time).isSame(start) && dayjs(s.end_time).isSame(end)
  );
  if (!matchingSlot) return res.status(409).json({ error: 'Gewünschter Slot ist nicht mehr verfügbar' });

  const assignedBayId = matchingSlot.suggested_bay?.id || null;
  const assignedEmpId = matchingSlot.suggested_employee?.id || null;

  // Nochmals konkreter Konflikt-Check (Race-Condition)
  const check = checkSlotFree({
    start_time: start.format('YYYY-MM-DDTHH:mm:ss'),
    end_time: end.format('YYYY-MM-DDTHH:mm:ss'),
    bay_id: assignedBayId,
    employee_id: assignedEmpId,
  });
  if (!check.ok) return res.status(409).json({ error: check.reason });

  // ----- Kunde suchen oder anlegen -----
  let customerId;
  if (customer.email) {
    const found = db.prepare('SELECT id FROM customers WHERE lower(email) = lower(?)').get(customer.email);
    if (found) customerId = found.id;
  }
  if (!customerId && customer.phone) {
    const found = db.prepare('SELECT id FROM customers WHERE phone = ?').get(customer.phone);
    if (found) customerId = found.id;
  }
  const isNewCustomer = !customerId;
  if (!customerId) {
    const info = db.prepare(
      `INSERT INTO customers (first_name, last_name, email, phone, whatsapp, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      firstName,
      lastName,
      customer.email || null,
      customer.phone || null,
      customer.whatsapp || customer.phone || null,
      customer.address || null,
      customer.notes || null
    );
    customerId = info.lastInsertRowid;
  }

  // ----- Fahrzeug suchen oder anlegen -----
  const plate = vehicle.license_plate.replace(/\s+/g, '').toUpperCase();
  let vehicleRow = db.prepare(
    `SELECT * FROM vehicles WHERE customer_id = ?
       AND replace(upper(license_plate), ' ', '') = ?`
  ).get(customerId, plate);
  let vehicleId;
  if (vehicleRow) {
    vehicleId = vehicleRow.id;
  } else {
    const info = db.prepare(
      `INSERT INTO vehicles (customer_id, license_plate, brand, model, year, vin, fuel_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      customerId,
      vehicle.license_plate,
      vehicle.brand || null,
      vehicle.model || null,
      vehicle.year || null,
      vehicle.vin || null,
      vehicle.fuel_type || null
    );
    vehicleId = info.lastInsertRowid;
  }

  // ----- Buchungsmodus bestimmen -----
  const mode = getSetting('booking_mode') || 'smart';
  let confirmation_status = 'bestaetigt';
  if (mode === 'pending') confirmation_status = 'pending';
  else if (mode === 'smart' && isNewCustomer) confirmation_status = 'pending';

  const externalRef = crypto.randomBytes(8).toString('hex');
  const effectiveSource = source || (req.apiScopes.includes('*') ? 'api' : 'online');

  // ----- Termin anlegen -----
  const statusToken = crypto.randomBytes(16).toString('hex');
  const info = db.prepare(
    `INSERT INTO appointments
       (customer_id, vehicle_id, employee_id, bay_id, start_time, end_time,
        status, source, confirmation_status, external_ref,
        title, notes, total_price, api_key_id, public_status_token)
     VALUES (?, ?, ?, ?, ?, ?, 'geplant', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    customerId, vehicleId, assignedEmpId, assignedBayId,
    start.format('YYYY-MM-DDTHH:mm:ss'),
    end.format('YYYY-MM-DDTHH:mm:ss'),
    effectiveSource, confirmation_status, externalRef,
    services.map((s) => s.name).join(', '),
    notes || null, totalPrice,
    req.apiKey?.id || null,
    statusToken
  );
  const appointmentId = info.lastInsertRowid;

  const insSvc = db.prepare(
    `INSERT INTO appointment_services
       (appointment_id, service_id, duration_minutes, price, quantity)
     VALUES (?, ?, ?, ?, 1)`
  );
  for (const s of services) {
    insSvc.run(appointmentId, s.id, s.duration_minutes, s.price);
  }

  const defaultChannels = [];
  if (customer.email) defaultChannels.push('email');
  if (customer.phone) defaultChannels.push('sms');
  try { scheduleRemindersForAppointment(appointmentId, defaultChannels); } catch { /* ignore */ }

  const appt = db.prepare(
    `SELECT a.*,
            c.first_name || ' ' || c.last_name AS customer_name,
            v.license_plate
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.id = ?`
  ).get(appointmentId);

  dispatchWebhooks('appointment.created', {
    appointment_id: appointmentId,
    source: effectiveSource,
    status: appt.status,
    start_time: appt.start_time,
    external_ref: externalRef,
  });

  res.status(201).json({
    reference: externalRef,
    confirmation_status,
    customer_status_path: `/status/${appt.public_status_token}`,
    appointment: {
      id: appt.id,
      start_time: appt.start_time,
      end_time: appt.end_time,
      status: appt.status,
      confirmation_status: appt.confirmation_status,
      customer_name: appt.customer_name,
      license_plate: appt.license_plate,
      total_price: appt.total_price,
      services: services.map((s) => ({ id: s.id, name: s.name })),
    },
  });
});

// ---------- Status einer Buchung abfragen ----------

router.get('/bookings/:ref', requireApiKey('booking:read'), (req, res) => {
  const a = db.prepare(
    `SELECT a.id, a.external_ref, a.start_time, a.end_time, a.status,
            a.confirmation_status, a.total_price,
            c.first_name || ' ' || c.last_name AS customer_name,
            v.license_plate
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.external_ref = ?`
  ).get(req.params.ref);
  if (!a) return res.status(404).json({ error: 'Buchung nicht gefunden' });
  res.json(a);
});

// ---------- Buchung stornieren ----------

router.delete('/bookings/:ref', requireApiKey('booking:cancel'), (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE external_ref = ?').get(req.params.ref);
  if (!a) return res.status(404).json({ error: 'Buchung nicht gefunden' });
  if (a.status === 'abgeschlossen') return res.status(409).json({ error: 'Termin bereits abgeschlossen' });
  const prev = a.status;
  db.prepare('UPDATE appointments SET status = \'storniert\', updated_at = datetime(\'now\') WHERE id = ?').run(a.id);
  dispatchWebhooks('appointment.status_changed', {
    appointment_id: a.id,
    old_status: prev,
    new_status: 'storniert',
    reason: 'public_cancel',
  });
  res.json({ success: true });
});

// ---------- Werkstatt-Info (öffentlich für Widget) ----------

router.get('/workshop', requireApiKey('services:read'), (_req, res) => {
  const hours = db.prepare('SELECT weekday, open_time, close_time, closed FROM workshop_hours ORDER BY weekday').all();
  res.json({
    name: process.env.WORKSHOP_NAME || 'KFZ Meisterwerkstatt',
    address: process.env.WORKSHOP_ADDRESS || '',
    phone: process.env.WORKSHOP_PHONE || '',
    email: process.env.WORKSHOP_EMAIL || '',
    hours,
    min_lead_hours: Number(getSetting('booking_min_lead_hours') || 2),
    max_days_ahead: Number(getSetting('booking_max_days_ahead') || 60),
  });
});

export default router;
