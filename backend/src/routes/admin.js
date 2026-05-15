import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();
router.use(requireAuth, requireRole('admin'));

// ---------- STATUS ----------
router.get('/status', (_req, res) => {
  const counts = {
    customers: db.prepare('SELECT COUNT(*) AS c FROM customers').get().c,
    vehicles: db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c,
    services: db.prepare('SELECT COUNT(*) AS c FROM services').get().c,
    appointments: db.prepare('SELECT COUNT(*) AS c FROM appointments').get().c,
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    bays: db.prepare('SELECT COUNT(*) AS c FROM bays').get().c,
    documents: db.prepare('SELECT COUNT(*) AS c FROM documents').get().c,
    expenses: db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c,
    reminders: db.prepare('SELECT COUNT(*) AS c FROM reminders').get().c,
  };
  res.json(counts);
});

// ---------- RESET ----------
// mode=transactional (default): löscht Termine, Dokumente, Ausgaben, Erinnerungen, Kunden, Fahrzeuge
// mode=full: zusätzlich Services, Bays, Werkstatt-Zeiten, Schedules, Skills, API-Keys
// mode=demo_only: löscht nur Einträge, die mit "DEMO" gekennzeichnet sind (fallback = transactional)
router.post('/reset', (req, res) => {
  const mode = req.body?.mode || 'transactional';
  const confirm = req.body?.confirm;
  if (confirm !== 'RESET') return res.status(400).json({ error: 'Bestätigung fehlt (confirm = "RESET")' });

  const tx = db.transaction(() => {
    // reihenfolge wegen FKs (aber wir haben CASCADE/SET NULL)
    db.prepare('DELETE FROM reminders').run();
    db.prepare('DELETE FROM document_items').run();
    db.prepare('DELETE FROM documents').run();
    db.prepare('DELETE FROM document_counters').run();
    db.prepare('DELETE FROM expenses').run();
    db.prepare('DELETE FROM appointment_services').run();
    db.prepare('DELETE FROM inventory_items').run();
    db.prepare('DELETE FROM audit_logs').run();
    db.prepare('DELETE FROM appointments').run();
    db.prepare('DELETE FROM vehicles').run();
    db.prepare('DELETE FROM customers').run();

    if (mode === 'full') {
      db.prepare('DELETE FROM webhooks').run();
      db.prepare('DELETE FROM employee_absences').run();
      db.prepare('DELETE FROM employee_skills').run();
      db.prepare('DELETE FROM employee_schedules').run();
      db.prepare('DELETE FROM services').run();
      db.prepare('DELETE FROM bays').run();
      db.prepare('DELETE FROM workshop_closures').run();
      db.prepare('DELETE FROM api_keys').run();
      db.prepare('DELETE FROM expense_categories').run();
    }
  });
  tx();
  res.json({ success: true, mode });
});

// ---------- SEED DEMO ----------
router.post('/seed', (req, res) => {
  const wipeFirst = !!req.body?.wipe;
  if (wipeFirst) {
    db.transaction(() => {
      db.prepare('DELETE FROM reminders').run();
      db.prepare('DELETE FROM document_items').run();
      db.prepare('DELETE FROM documents').run();
      db.prepare('DELETE FROM document_counters').run();
      db.prepare('DELETE FROM expenses').run();
      db.prepare('DELETE FROM appointment_services').run();
      db.prepare('DELETE FROM inventory_items').run();
      db.prepare('DELETE FROM audit_logs').run();
      db.prepare('DELETE FROM appointments').run();
      db.prepare('DELETE FROM vehicles').run();
      db.prepare('DELETE FROM customers').run();
    })();
  }

  const created = { users: 0, bays: 0, services: 0, customers: 0, vehicles: 0, appointments: 0, documents: 0, expenses: 0, schedules: 0 };

  const tx = db.transaction(() => {
    // ---- Mitarbeiter (zusätzliche Beispiel-Accounts) ----
    const extraUsers = [
      ['meister@werkstatt.local', 'Anna Schmidt (Meisterin)', 'admin', '030 40244 16'],
      ['mechaniker1@werkstatt.local', 'Thomas Weber', 'mitarbeiter', '030 40244 17'],
      ['mechaniker2@werkstatt.local', 'Selim Yilmaz', 'mitarbeiter', '030 40244 18'],
    ];
    for (const [email, name, role, phone] of extraUsers) {
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (!exists) {
        db.prepare(
          `INSERT INTO users (email, password_hash, full_name, role, phone)
           VALUES (?, ?, ?, ?, ?)`
        ).run(email, bcrypt.hashSync('demo1234', 10), name, role, phone);
        created.users++;
      }
    }

    // ---- Bühnen ----
    const bayCount = db.prepare('SELECT COUNT(*) AS c FROM bays').get().c;
    if (bayCount === 0) {
      const insB = db.prepare('INSERT INTO bays (name, type, description, active, sort_order) VALUES (?, ?, ?, 1, ?)');
      insB.run('Bühne 1', 'hebebuehne', 'Hauptwerkstatt links', 1); created.bays++;
      insB.run('Bühne 2', 'hebebuehne', 'Hauptwerkstatt rechts', 2); created.bays++;
      insB.run('EV-Bühne', 'ev_hebebuehne', 'Für Elektrofahrzeuge', 3); created.bays++;
      insB.run('Platz Schnelldienst', 'platz', 'Öl, Reifen, kleine Arbeiten', 4); created.bays++;
    }

    // ---- Dienstleistungen ----
    const services = [
      ['Inspektion klein', 'Kleine Inspektion inkl. Ölwechsel', 'Inspektion', 90, 179, 15, null, [], 1],
      ['Inspektion groß', 'Große Inspektion nach Herstellerangaben', 'Inspektion', 180, 349, 30, null, [], 1],
      ['Ölwechsel', 'Motoröl + Filter', 'Wartung', 45, 89, 10, null, [], 1],
      ['HU/AU Vorbereitung', 'Vorabcheck und Organisation TÜV', 'TÜV', 60, 149, 15, null, ['hu'], 1],
      ['Bremsen vorne', 'Bremsscheiben und -beläge vorne', 'Bremsen', 120, 249, 20, 'hebebuehne', [], 1],
      ['Bremsen hinten', 'Bremsscheiben und -beläge hinten', 'Bremsen', 120, 219, 20, 'hebebuehne', [], 1],
      ['Reifenwechsel', 'Reifen umstecken, inkl. Auswuchten', 'Reifen', 45, 49, 10, null, [], 1],
      ['Reifenmontage neu', 'Neue Reifen montieren', 'Reifen', 60, 89, 10, null, [], 1],
      ['Klimaanlagen-Service', 'Klimaanlage prüfen und befüllen', 'Klima', 60, 129, 10, null, [], 1],
      ['Batteriewechsel', 'Autobatterie tauschen', 'Elektrik', 30, 59, 5, null, [], 1],
      ['Fehlerspeicher auslesen', 'OBD-Diagnose und Löschung', 'Diagnose', 30, 49, 5, null, ['diagnose'], 1],
      ['Zahnriemen wechseln', 'Inkl. Wasserpumpe', 'Motor', 300, 649, 60, 'hebebuehne', [], 0],
      ['Auspuff reparieren', 'Auspuff-Instandsetzung', 'Motor', 120, 299, 20, 'hebebuehne', [], 1],
      ['Karosserie-Kleinschaden', 'Beulen ausbeulen, lackieren', 'Karosserie', 240, 449, 30, null, ['karosserie'], 0],
      ['Scheibenwischer wechseln', 'Vorne + hinten', 'Wartung', 15, 29, 0, null, [], 1],
      ['Lichtprüfung', 'Alle Leuchten prüfen', 'Wartung', 20, 19, 5, null, [], 1],
      ['Kühlmittel wechseln', 'Kühlsystem spülen und neu befüllen', 'Motor', 90, 149, 15, null, [], 1],
      ['Getriebeöl wechseln', 'Getriebeöl tauschen', 'Getriebe', 90, 179, 15, 'hebebuehne', [], 1],
      ['Auspuffanlage neu', 'Komplette Auspuffanlage erneuern', 'Motor', 180, 599, 30, 'hebebuehne', [], 0],
      ['HV-Batterie-Check', 'Hochvoltbatterie-Diagnose', 'Elektrik', 60, 199, 15, 'ev_hebebuehne', ['hv'], 1],
    ];
    const sStmt = db.prepare(
      `INSERT INTO services (name, description, category, duration_minutes, price, buffer_minutes, required_bay_type, required_skills, online_bookable, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const existingSvc = new Set(db.prepare('SELECT lower(name) AS n FROM services').all().map((r) => r.n));
    for (const s of services) {
      if (!existingSvc.has(s[0].toLowerCase())) {
        sStmt.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6], JSON.stringify(s[7]), s[8]);
        created.services++;
      }
    }

    // ---- Mitarbeiter-Dienstpläne (alle aktiven) Mo-Fr 9-18 ----
    const activeEmps = db.prepare("SELECT id FROM users WHERE active = 1 AND role IN ('admin','mitarbeiter')").all();
    const schStmt = db.prepare(
      `INSERT OR IGNORE INTO employee_schedules (employee_id, weekday, start_time, end_time, break_start, break_end) VALUES (?,?,?,?,?,?)`
    );
    for (const u of activeEmps) {
      for (let wd = 0; wd < 5; wd++) {
        const r = schStmt.run(u.id, wd, '09:00', '18:00', '12:30', '13:30');
        if (r.changes) created.schedules++;
      }
    }

    // ---- Kunden + Fahrzeuge ----
    const customers = [
      ['Lukas', 'Berger', 'lukas.berger@example.com', '0171 1111111', null, 'Hauptstraße 12, 13507 Berlin'],
      ['Sabine', 'Hofmann', 'sabine@example.com', '0170 2222222', null, 'Lindenweg 3, 13509 Berlin'],
      ['Murat', 'Demir', 'murat.demir@example.com', '0172 3333333', '4917233333333', 'Reinickendorfer Str. 45, 13347 Berlin'],
      ['Julia', 'Krause', 'julia.k@example.com', '0173 4444444', null, 'Ollenhauerstr. 8, 13403 Berlin'],
      ['Peter', 'Schulz', 'peter.schulz@example.com', '0174 5555555', null, 'Kopenhagener Str. 34, 10437 Berlin'],
      ['Anja', 'Bauer', 'anja.b@example.com', '0175 6666666', null, 'Prenzlauer Allee 89, 10405 Berlin'],
      ['Fatma', 'Kaya', 'fatma.kaya@example.com', '0176 7777777', null, 'Karl-Marx-Str. 112, 12043 Berlin'],
      ['Michael', 'Fischer', 'michael.f@example.com', '0177 8888888', null, 'Sonnenallee 200, 12059 Berlin'],
      ['Elena', 'Petrov', 'elena.p@example.com', '0178 9999999', null, 'Oranienstr. 17, 10999 Berlin'],
      ['David', 'Klein', 'david.klein@example.com', '0179 1010101', null, 'Kantstr. 48, 10625 Berlin'],
      ['Maria', 'Schulze', 'maria.s@example.com', '0170 1212121', null, 'Uhlandstr. 88, 10717 Berlin'],
      ['Ahmet', 'Yildiz', 'ahmet.y@example.com', '0171 1313131', null, 'Turmstr. 55, 10551 Berlin'],
      ['Carolin', 'Lenz', 'carolin.l@example.com', '0172 1414141', null, 'Müllerstr. 22, 13353 Berlin'],
      ['Hans', 'Meier', 'hans.meier@example.com', '0173 1515151', null, 'Badstr. 9, 13357 Berlin'],
      ['Nicole', 'Roth', 'nicole.r@example.com', '0174 1616161', null, 'Seestr. 71, 13353 Berlin'],
    ];
    const custStmt = db.prepare(
      `INSERT INTO customers (first_name, last_name, email, phone, whatsapp, address) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const customerIds = [];
    for (const c of customers) {
      const r = custStmt.run(...c);
      customerIds.push(r.lastInsertRowid);
      created.customers++;
    }

    // ---- Fahrzeuge (1-2 pro Kunde) ----
    const vehicleTemplates = [
      ['VW', 'Golf VII', 2018, 'Diesel', 'Silber'],
      ['BMW', '320d', 2019, 'Diesel', 'Schwarz'],
      ['Audi', 'A4 Avant', 2020, 'Benzin', 'Weiß'],
      ['Mercedes-Benz', 'C 220d', 2021, 'Diesel', 'Grau'],
      ['Opel', 'Astra K', 2017, 'Benzin', 'Blau'],
      ['Ford', 'Focus', 2016, 'Benzin', 'Rot'],
      ['Skoda', 'Octavia', 2022, 'Diesel', 'Grün'],
      ['Toyota', 'Yaris Hybrid', 2023, 'Hybrid', 'Weiß'],
      ['Tesla', 'Model 3', 2023, 'Elektro', 'Blau'],
      ['Renault', 'Zoe', 2022, 'Elektro', 'Weiß'],
      ['Hyundai', 'i30', 2019, 'Benzin', 'Schwarz'],
      ['Peugeot', '308', 2020, 'Benzin', 'Grau'],
      ['Kia', 'Ceed', 2021, 'Benzin', 'Silber'],
      ['VW', 'Passat', 2018, 'Diesel', 'Schwarz'],
      ['Audi', 'Q3', 2021, 'Benzin', 'Weiß'],
    ];
    const vehStmt = db.prepare(
      `INSERT INTO vehicles (customer_id, license_plate, brand, model, year, fuel_type, color, mileage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const vehicleIds = [];
    for (let i = 0; i < customerIds.length; i++) {
      const v = vehicleTemplates[i % vehicleTemplates.length];
      const plate = `B-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))} ${100 + i * 7}`;
      const r = vehStmt.run(customerIds[i], plate, v[0], v[1], v[2], v[3], v[4], 40000 + i * 7000);
      vehicleIds.push(r.lastInsertRowid);
      created.vehicles++;
      // ~1/3 Kunden haben ein 2. Fahrzeug
      if (i % 3 === 0 && i < vehicleTemplates.length - 1) {
        const v2 = vehicleTemplates[(i + 5) % vehicleTemplates.length];
        const plate2 = `B-${String.fromCharCode(66 + (i % 25))}${String.fromCharCode(66 + ((i * 5) % 25))} ${200 + i * 11}`;
        const r2 = vehStmt.run(customerIds[i], plate2, v2[0], v2[1], v2[2], v2[3], v2[4], 25000 + i * 5000);
        vehicleIds.push(r2.lastInsertRowid);
        created.vehicles++;
      }
    }

    // ---- Termine (Mix: abgeschlossen, heute, kommende) ----
    const baysRows = db.prepare('SELECT id FROM bays WHERE active = 1 ORDER BY sort_order').all();
    const svcs = db.prepare('SELECT id, duration_minutes, price FROM services WHERE active = 1').all();
    const emps = db.prepare("SELECT id FROM users WHERE active = 1 AND role IN ('admin','mitarbeiter')").all();

    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }
    function isoDT(d) { return iso(d).replace('T', ' '); }

    const now = new Date();
    const apptStmt = db.prepare(
      `INSERT INTO appointments
        (customer_id, vehicle_id, employee_id, bay_id, start_time, end_time, status, source, confirmation_status,
         title, notes, total_price, actual_start_time, actual_end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bestaetigt', ?, ?, ?, ?, ?)`
    );
    const asvcStmt = db.prepare(
      `INSERT INTO appointment_services (appointment_id, service_id, price, duration_minutes, quantity) VALUES (?, ?, ?, ?, ?)`
    );

    const apptIds = [];

    // 40 abgeschlossene Termine in den letzten 60 Tagen, mit Ist-Zeiten
    for (let i = 0; i < 40; i++) {
      const daysBack = 1 + Math.floor(Math.random() * 60);
      const s = new Date(now);
      s.setDate(s.getDate() - daysBack);
      s.setHours(9 + Math.floor(Math.random() * 8), [0, 15, 30, 45][Math.floor(Math.random() * 4)], 0, 0);
      // Sa/So überspringen
      if (s.getDay() === 0 || s.getDay() === 6) { i--; continue; }

      const svcPicks = pickMany(svcs, 1 + Math.floor(Math.random() * 2));
      const totalMin = svcPicks.reduce((t, x) => t + x.duration_minutes, 0);
      const totalPrice = svcPicks.reduce((t, x) => t + x.price, 0);
      const e = new Date(s.getTime() + totalMin * 60000);

      const actualStart = new Date(s.getTime() + (Math.random() * 20 - 5) * 60000);
      const actualEnd = new Date(e.getTime() + (Math.random() * 40 - 10) * 60000);

      const vid = vehicleIds[Math.floor(Math.random() * vehicleIds.length)];
      const custRow = db.prepare('SELECT customer_id FROM vehicles WHERE id = ?').get(vid);
      const r = apptStmt.run(
        custRow.customer_id, vid,
        emps[Math.floor(Math.random() * emps.length)].id,
        baysRows[Math.floor(Math.random() * baysRows.length)].id,
        iso(s), iso(e),
        'abgeschlossen', 'intern',
        svcPicks.map((x) => x.id).join(','), null, totalPrice,
        isoDT(actualStart), isoDT(actualEnd)
      );
      apptIds.push({ id: r.lastInsertRowid, total: totalPrice, customer_id: custRow.customer_id, vehicle_id: vid });
      svcPicks.forEach((sp) => asvcStmt.run(r.lastInsertRowid, sp.id, sp.price, sp.duration_minutes, 1));
      created.appointments++;
    }

    // Heutiger Betrieb: 1 "in_arbeit", 3-4 "bestätigt" (später heute)
    const today = new Date(now);
    today.setHours(9, 0, 0, 0);
    const todaysCount = 4;
    for (let i = 0; i < todaysCount; i++) {
      const hour = 9 + i * 2;
      const s = new Date(today);
      s.setHours(hour, 0, 0, 0);
      const svcPicks = pickMany(svcs, 1);
      const totalMin = svcPicks.reduce((t, x) => t + x.duration_minutes, 0);
      const totalPrice = svcPicks.reduce((t, x) => t + x.price, 0);
      const e = new Date(s.getTime() + totalMin * 60000);
      const vid = vehicleIds[i];
      const custRow = db.prepare('SELECT customer_id FROM vehicles WHERE id = ?').get(vid);
      const status = i === 0 ? 'in_arbeit' : 'bestaetigt';
      const actualStart = i === 0 ? isoDT(new Date(s.getTime() - 15 * 60000)) : null;
      const r = apptStmt.run(
        custRow.customer_id, vid,
        emps[i % emps.length].id,
        baysRows[i % baysRows.length].id,
        iso(s), iso(e),
        status, 'intern',
        null, null, totalPrice,
        actualStart, null
      );
      svcPicks.forEach((sp) => asvcStmt.run(r.lastInsertRowid, sp.id, sp.price, sp.duration_minutes, 1));
      created.appointments++;
    }

    // Zukünftige Termine (nächste 14 Tage)
    for (let i = 0; i < 15; i++) {
      const daysAhead = 1 + Math.floor(Math.random() * 14);
      const s = new Date(now);
      s.setDate(s.getDate() + daysAhead);
      s.setHours(9 + Math.floor(Math.random() * 8), [0, 15, 30, 45][Math.floor(Math.random() * 4)], 0, 0);
      if (s.getDay() === 0 || s.getDay() === 6) { i--; continue; }
      const svcPicks = pickMany(svcs, 1 + Math.floor(Math.random() * 2));
      const totalMin = svcPicks.reduce((t, x) => t + x.duration_minutes, 0);
      const totalPrice = svcPicks.reduce((t, x) => t + x.price, 0);
      const e = new Date(s.getTime() + totalMin * 60000);
      const vid = vehicleIds[Math.floor(Math.random() * vehicleIds.length)];
      const custRow = db.prepare('SELECT customer_id FROM vehicles WHERE id = ?').get(vid);
      const r = apptStmt.run(
        custRow.customer_id, vid,
        emps[Math.floor(Math.random() * emps.length)].id,
        baysRows[Math.floor(Math.random() * baysRows.length)].id,
        iso(s), iso(e),
        i % 5 === 0 ? 'geplant' : 'bestaetigt', 'intern',
        null, null, totalPrice, null, null
      );
      svcPicks.forEach((sp) => asvcStmt.run(r.lastInsertRowid, sp.id, sp.price, sp.duration_minutes, 1));
      created.appointments++;
    }

    // ---- Rechnungen aus abgeschlossenen Terminen ----
    const PREFIX = { rechnung: 'RE', angebot: 'AN', storno: 'ST', gutschrift: 'GS' };
    function makeDocNumber(type) {
      const y = new Date().getFullYear();
      const row = db.prepare('SELECT last_number FROM document_counters WHERE year=? AND type=?').get(y, type);
      const next = (row?.last_number || 0) + 1;
      if (row) db.prepare('UPDATE document_counters SET last_number=? WHERE year=? AND type=?').run(next, y, type);
      else db.prepare('INSERT INTO document_counters (year,type,last_number) VALUES (?,?,?)').run(y, type, next);
      return `${PREFIX[type]}-${y}-${String(next).padStart(4, '0')}`;
    }
    const docStmt = db.prepare(
      `INSERT INTO documents (doc_number, type, status, customer_id, vehicle_id, appointment_id, issue_date, due_date,
         subtotal_net, tax_rate, tax_amount, total_gross, paid_amount, payment_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 19, ?, ?, ?, ?)`
    );
    const docItemStmt = db.prepare(
      `INSERT INTO document_items (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
       VALUES (?, ?, ?, ?, ?, 'Stk.', ?, 0, ?)`
    );
    // 80% der abgeschlossenen Termine → Rechnung; davon 70% bezahlt
    for (const a of apptIds) {
      if (Math.random() > 0.8) continue;
      const svcRows = db.prepare(
        `SELECT asv.service_id, asv.price, asv.quantity, s.name
         FROM appointment_services asv JOIN services s ON s.id = asv.service_id
         WHERE asv.appointment_id = ?`
      ).all(a.id);
      if (svcRows.length === 0) continue;
      const net = svcRows.reduce((t, x) => t + x.price * x.quantity, 0);
      const tax = Math.round(net * 0.19 * 100) / 100;
      const gross = Math.round((net + tax) * 100) / 100;
      const aRow = db.prepare('SELECT start_time FROM appointments WHERE id = ?').get(a.id);
      const issueDate = aRow.start_time.slice(0, 10);
      const dueDate = new Date(new Date(issueDate).getTime() + 14 * 86400000).toISOString().slice(0, 10);
      const paid = Math.random() < 0.7;
      const num = makeDocNumber('rechnung');
      const r = docStmt.run(
        num, 'rechnung', paid ? 'bezahlt' : 'offen',
        a.customer_id, a.vehicle_id, a.id,
        issueDate, dueDate,
        Math.round(net * 100) / 100, tax, gross,
        paid ? gross : 0, paid ? dueDate : null
      );
      svcRows.forEach((s, i) => docItemStmt.run(r.lastInsertRowid, i + 1, s.service_id, s.name, s.quantity, s.price, Math.round(s.price * s.quantity * 100) / 100));
      created.documents++;
    }

    // Ein paar Angebote
    for (let i = 0; i < 4; i++) {
      const svcPicks = pickMany(svcs, 2);
      const net = svcPicks.reduce((t, x) => t + x.price, 0);
      const tax = Math.round(net * 0.19 * 100) / 100;
      const gross = Math.round((net + tax) * 100) / 100;
      const cid = customerIds[i * 2];
      const vid = db.prepare('SELECT id FROM vehicles WHERE customer_id = ? LIMIT 1').get(cid)?.id;
      const issueDate = new Date(Date.now() - i * 2 * 86400000).toISOString().slice(0, 10);
      const num = makeDocNumber('angebot');
      const r = docStmt.run(
        num, 'angebot', i % 2 === 0 ? 'entwurf' : 'offen',
        cid, vid, null, issueDate, null,
        Math.round(net * 100) / 100, tax, gross, 0, null
      );
      svcPicks.forEach((s, j) => docItemStmt.run(r.lastInsertRowid, j + 1, s.id, s.name || `Leistung ${s.id}`, 1, s.price, s.price));
      created.documents++;
    }

    // ---- Ausgaben ----
    const cats = db.prepare('SELECT id, name FROM expense_categories').all();
    const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
    const vendors = ['ATU', 'Bosch Service', 'Stahlgruber', 'Würth', 'Continental', 'Hella', 'Mann Filter', 'Castrol'];
    const samples = [
      ['Ersatzteile', 'Bremsbeläge VW Golf', 85.50],
      ['Ersatzteile', 'Ölfilter-Set 10x', 42.90],
      ['Ersatzteile', 'Stoßdämpfer hinten', 189.00],
      ['Verbrauchsmaterial', 'Motoröl 5W-30 60L', 350.00],
      ['Verbrauchsmaterial', 'Kühlmittel Konzentrat', 89.00],
      ['Werkzeug', 'Drehmomentschlüssel', 140.00],
      ['Werkzeug', 'OBD Diagnosegerät Pro', 899.00],
      ['Miete', 'Gewerbemiete Werkstatt', 2200.00],
      ['Strom/Wasser', 'Stromrechnung', 380.00],
      ['Versicherung', 'Betriebshaftpflicht', 220.00],
      ['Marketing', 'Google Ads', 150.00],
      ['Bürobedarf', 'Büromaterial', 45.00],
      ['Fahrzeugkosten', 'Tankfüllung Werkstattwagen', 110.00],
    ];
    const eStmt = db.prepare(
      `INSERT INTO expenses (expense_date, category_id, vendor, description, amount_net, tax_rate, tax_amount, amount_gross, payment_method, invoice_number)
       VALUES (?, ?, ?, ?, ?, 19, ?, ?, 'ueberweisung', ?)`
    );
    for (let monthsBack = 0; monthsBack <= 3; monthsBack++) {
      for (const s of samples) {
        if (Math.random() < 0.3 && monthsBack > 0) continue;
        const d = new Date(now);
        d.setMonth(d.getMonth() - monthsBack);
        d.setDate(1 + Math.floor(Math.random() * 27));
        const net = s[2] * (0.9 + Math.random() * 0.2);
        const tax = Math.round(net * 0.19 * 100) / 100;
        const gross = Math.round((net + tax) * 100) / 100;
        eStmt.run(
          d.toISOString().slice(0, 10),
          catByName[s[0]] || null,
          vendors[Math.floor(Math.random() * vendors.length)],
          s[1],
          Math.round(net * 100) / 100,
          tax,
          gross,
          `F-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`
        );
        created.expenses++;
      }
    }
  });

  tx();
  res.json({ success: true, created });
});

// ---------- SERVICE-KATALOG IMPORT (Excel → JSON) ----------
router.post('/import-service-catalog', (req, res) => {
  const { mode = 'upsert', clear = false, keepPrices = true } = req.body || {};

  let data;
  try {
    const raw = readFileSync(join(__dirname, '..', 'seeds', 'service-catalog.json'), 'utf-8');
    data = JSON.parse(raw);
  } catch (e) {
    return res.status(500).json({ error: 'Service-Katalog nicht gefunden: ' + e.message });
  }

  const stats = { total: data.services.length, created: 0, updated: 0, skipped: 0, deactivated: 0 };

  const findByCode = db.prepare('SELECT id, price FROM services WHERE internal_code = ?');
  const findByName = db.prepare('SELECT id, price FROM services WHERE lower(name) = lower(?) AND internal_code IS NULL');

  const ins = db.prepare(`
    INSERT INTO services (
      name, description, category, duration_minutes, price, active,
      buffer_minutes, required_bay_type, required_skills, online_bookable,
      internal_code, duration_min_minutes, duration_max_minutes,
      buffer_before_minutes, buffer_after_minutes, complexity, color, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upd = db.prepare(`
    UPDATE services SET
      name=?, description=?, category=?, duration_minutes=?, price=?, active=1,
      buffer_minutes=?, required_bay_type=?, online_bookable=?,
      internal_code=?, duration_min_minutes=?, duration_max_minutes=?,
      buffer_before_minutes=?, buffer_after_minutes=?, complexity=?, color=?, notes=?
    WHERE id=?
  `);

  const tx = db.transaction(() => {
    if (clear) {
      // alle bisherigen Katalog-Einträge (mit internal_code) entfernen
      // aber nur, wenn keine Termine daran hängen
      const used = db.prepare(
        `SELECT DISTINCT service_id FROM appointment_services`
      ).all().map((x) => x.service_id);
      const all = db.prepare('SELECT id, internal_code FROM services').all();
      for (const s of all) {
        if (used.includes(s.id)) {
          db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(s.id);
          stats.deactivated++;
        } else {
          db.prepare('DELETE FROM services WHERE id = ?').run(s.id);
        }
      }
    }

    for (const s of data.services) {
      try {
        const existingByCode = findByCode.get(s.internal_code);
        const existing = existingByCode || findByName.get(s.name);
        const priceToUse = keepPrices && existing?.price ? existing.price : (s.price || 0);

        if (existing && mode === 'upsert') {
          upd.run(
            s.name, s.description, s.category, s.duration_minutes, priceToUse,
            s.buffer_minutes, s.required_bay_type, s.online_bookable,
            s.internal_code, s.duration_min_minutes, s.duration_max_minutes,
            s.buffer_before_minutes, s.buffer_after_minutes, s.complexity,
            s.color, s.notes,
            existing.id
          );
          stats.updated++;
        } else if (existing && mode === 'create_only') {
          stats.skipped++;
        } else {
          ins.run(
            s.name, s.description, s.category, s.duration_minutes, s.price, 1,
            s.buffer_minutes, s.required_bay_type, JSON.stringify(s.required_skills || []), s.online_bookable,
            s.internal_code, s.duration_min_minutes, s.duration_max_minutes,
            s.buffer_before_minutes, s.buffer_after_minutes, s.complexity,
            s.color, s.notes
          );
          stats.created++;
        }
      } catch (e) {
        stats.skipped++;
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.json({ success: true, ...stats, categories: data.categories?.length || 0 });
});

function pickMany(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

export default router;
