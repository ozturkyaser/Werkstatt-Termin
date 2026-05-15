import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { extractVehicleRegistration, normalizePlate, recognizeLicensePlate, platesMatch } from '../services/ai.js';

const router = Router();
router.use(requireAuth);

router.post('/scan-vehicle-registration', async (req, res) => {
  const { image } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image (Data-URL) ist erforderlich' });

  try {
    const extracted = await extractVehicleRegistration(image);

    // Matches in der Datenbank suchen
    const plate = normalizePlate(extracted?.vehicle?.license_plate);
    let matchedVehicle = null;
    let matchedCustomer = null;

    if (plate) {
      matchedVehicle = db
        .prepare(
          `SELECT v.*, c.first_name AS c_first_name, c.last_name AS c_last_name
           FROM vehicles v JOIN customers c ON c.id = v.customer_id
           WHERE upper(v.license_plate) = ?`
        )
        .get(plate);
    }
    if (matchedVehicle) {
      matchedCustomer = db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(matchedVehicle.customer_id);
    } else if (extracted?.customer?.first_name && extracted?.customer?.last_name) {
      matchedCustomer = db
        .prepare(
          `SELECT * FROM customers
           WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)
           LIMIT 1`
        )
        .get(extracted.customer.first_name, extracted.customer.last_name);
    }

    res.json({
      extracted,
      match: {
        customer: matchedCustomer || null,
        vehicle: matchedVehicle || null,
      },
    });
  } catch (err) {
    console.error('KI-Scan-Fehler:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Bequemer All-in-one: extrahiert, legt fehlendes an, gibt fertige IDs zurück.
router.post('/scan-and-import', async (req, res) => {
  const { image, createIfMissing = true } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image (Data-URL) ist erforderlich' });

  try {
    const extracted = await extractVehicleRegistration(image);
    const plate = normalizePlate(extracted?.vehicle?.license_plate);

    let customer = null;
    let vehicle = null;

    if (plate) {
      vehicle = db
        .prepare('SELECT * FROM vehicles WHERE upper(license_plate) = ?')
        .get(plate);
      if (vehicle) customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(vehicle.customer_id);
    }

    if (!customer && extracted?.customer?.first_name && extracted?.customer?.last_name) {
      customer = db
        .prepare(
          `SELECT * FROM customers
           WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)
           LIMIT 1`
        )
        .get(extracted.customer.first_name, extracted.customer.last_name);
    }

    if (!customer && createIfMissing && extracted?.customer?.first_name && extracted?.customer?.last_name) {
      const info = db
        .prepare(
          `INSERT INTO customers (first_name, last_name, address, notes)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          extracted.customer.first_name,
          extracted.customer.last_name,
          extracted.customer.address || null,
          '(Automatisch per KI-Scan angelegt)'
        );
      customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    }

    if (!vehicle && createIfMissing && customer && plate) {
      const v = extracted.vehicle || {};
      const info = db
        .prepare(
          `INSERT INTO vehicles
           (customer_id, license_plate, brand, model, year, vin, fuel_type, color, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          customer.id, plate,
          v.brand || null, v.model || null, v.year || null,
          v.vin || null, v.fuel_type || null, v.color || null,
          '(Automatisch per KI-Scan angelegt)'
        );
      vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid);
    }

    res.json({ extracted, customer, vehicle });
  } catch (err) {
    console.error('KI-Scan-Import-Fehler:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ---- Kennzeichen erkennen ----
router.post('/recognize-plate', async (req, res) => {
  const { image, expected_plate } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image (Data-URL) ist erforderlich' });
  try {
    const result = await recognizeLicensePlate(image);
    let match = null;
    if (expected_plate && result.plate) {
      match = platesMatch(result.plate, expected_plate);
    }

    // Fahrzeug in DB nachschlagen
    let vehicle = null;
    let customer = null;
    if (result.plate) {
      vehicle = db.prepare(
        `SELECT v.*, c.first_name AS c_first_name, c.last_name AS c_last_name
           FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id
          WHERE upper(replace(replace(v.license_plate,'-',''),' ','')) =
                upper(replace(replace(?,'-',''),' ',''))`
      ).get(result.plate);
      if (vehicle) {
        customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(vehicle.customer_id);
      }
    }

    res.json({ ...result, expected_plate: expected_plate || null, match, vehicle, customer });
  } catch (err) {
    console.error('KI-Kennzeichen-Fehler:', err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;
