import './loadRuntimeConfig.js';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(
  __dirname,
  '..',
  process.env.DATABASE_PATH || './data/werkstatt.sqlite'
);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'mitarbeiter' CHECK(role IN ('admin','mitarbeiter')),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(last_name, first_name);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  license_plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  mileage INTEGER,
  fuel_type TEXT,
  color TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(license_plate);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  required_bay_type TEXT,
  required_skills TEXT,              -- JSON-Array, z.B. ["hv"]
  online_bookable INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bay_id INTEGER REFERENCES bays(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'geplant'
    CHECK(status IN ('geplant','bestaetigt','in_arbeit','abgeschlossen','storniert')),
  source TEXT NOT NULL DEFAULT 'intern'
    CHECK(source IN ('intern','online','telefon_ki','api')),
  confirmation_status TEXT NOT NULL DEFAULT 'bestaetigt'
    CHECK(confirmation_status IN ('pending','bestaetigt')),
  external_ref TEXT UNIQUE,
  title TEXT,
  notes TEXT,
  total_price REAL NOT NULL DEFAULT 0,
  mileage_at_service INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_vehicle ON appointments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_appointments_employee ON appointments(employee_id);

CREATE TABLE IF NOT EXISTS appointment_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  price REAL NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_appsvc_appointment ON appointment_services(appointment_id);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('email','sms','whatsapp','internal')),
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'geplant' CHECK(status IN ('geplant','gesendet','fehler','abgebrochen')),
  last_error TEXT,
  recipient TEXT,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_reminders_appointment ON reminders(appointment_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ Kapazität & Verfügbarkeit ============

CREATE TABLE IF NOT EXISTS bays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'hebebuehne',   -- hebebuehne, ev_hebebuehne, platz, spezial
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workshop_hours (
  weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),  -- 0=Mo .. 6=So
  open_time TEXT,       -- "09:00" oder NULL = geschlossen
  close_time TEXT,      -- "18:00"
  closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workshop_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  reason TEXT,
  UNIQUE(date)
);

CREATE TABLE IF NOT EXISTS employee_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,       -- "09:00"
  end_time TEXT NOT NULL,         -- "18:00"
  break_start TEXT,               -- "12:30" (optional)
  break_end TEXT,                 -- "13:30" (optional)
  UNIQUE(employee_id, weekday)
);

CREATE TABLE IF NOT EXISTS employee_absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date TEXT NOT NULL,        -- YYYY-MM-DD
  to_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'urlaub',  -- urlaub | krank | fortbildung | sonstiges
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_absences_emp ON employee_absences(employee_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS employee_skills (
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,            -- "hv", "karosserie", "hu", "diagnose" ...
  PRIMARY KEY (employee_id, skill)
);

-- ============ Externe API-Zugänge ============

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,       -- "wk_live_1234" (für Anzeige)
  key_hash TEXT NOT NULL,         -- bcrypt-Hash
  scopes TEXT NOT NULL DEFAULT '["booking:read","booking:create"]', -- JSON
  active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============ Dokumente (Angebot / Rechnung / Storno / Gutschrift) ============

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number TEXT NOT NULL UNIQUE,                   -- RE-2026-0001, AN-2026-0001, ST-...
  type TEXT NOT NULL CHECK(type IN ('angebot','rechnung','storno','gutschrift')),
  status TEXT NOT NULL DEFAULT 'entwurf'
    CHECK(status IN ('entwurf','offen','bezahlt','teilweise_bezahlt','storniert','angenommen','abgelehnt')),
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  related_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL, -- z.B. Storno → Rechnung
  issue_date TEXT NOT NULL,
  due_date TEXT,
  payment_date TEXT,
  paid_amount REAL NOT NULL DEFAULT 0,
  subtotal_net REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 19,
  tax_amount REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  payment_method TEXT,                              -- bar | ueberweisung | karte | paypal
  notes TEXT,
  internal_notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type, status);
CREATE INDEX IF NOT EXISTS idx_documents_issue ON documents(issue_date);

CREATE TABLE IF NOT EXISTS document_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Stk.',
  unit_price REAL NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL DEFAULT 0,
  line_total_net REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_docitems_doc ON document_items(document_id);

-- Zähler für Nummernkreise (pro Jahr & Typ)
CREATE TABLE IF NOT EXISTS document_counters (
  year INTEGER NOT NULL,
  type TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, type)
);

-- ============ Buchhaltung (Ausgaben) ============

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,           -- YYYY-MM-DD
  category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  vendor TEXT,                          -- Lieferant / Händler
  description TEXT NOT NULL,
  amount_net REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 19,
  tax_amount REAL NOT NULL DEFAULT 0,
  amount_gross REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'ueberweisung',
  invoice_number TEXT,                  -- Fremde Rechnungsnummer
  receipt_file TEXT,                    -- Pfad zum Beleg (optional)
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ============ Arbeitsprotokolle (Work-Logs) ============

CREATE TABLE IF NOT EXISTS work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,

  started_at TEXT,
  started_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_plate_input TEXT,           -- Kennzeichen wie eingegeben/erkannt
  start_plate_ai TEXT,              -- KI-Rohergebnis
  start_plate_match INTEGER,        -- 1 wenn Fahrzeug-Kennzeichen übereinstimmt
  start_photo TEXT,                 -- data-URL oder Pfad
  start_mileage INTEGER,

  ended_at TEXT,
  ended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  end_plate_input TEXT,
  end_plate_ai TEXT,
  end_plate_match INTEGER,
  end_photo TEXT,
  end_mileage INTEGER,

  checklist_status TEXT DEFAULT 'offen'
    CHECK(checklist_status IN ('offen','ok','maengel','nicht_freigegeben')),
  notes TEXT,                       -- Arbeitsbericht, Auffälligkeiten
  signature_data TEXT,              -- Base64 PNG der Unterschrift
  signature_name TEXT,              -- Klartext-Name des Unterzeichners

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_worklogs_appointment ON work_logs(appointment_id);

-- ============ Prüf-Checklisten ============

-- Vorlagen: 1 Template pro Leistung/Kategorie
CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'service' CHECK(scope IN ('service','category','global')),
  service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
  category TEXT,                    -- wenn scope='category': der Kategorie-Name
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'arbeit'     -- 'arbeit' = Mitarbeiter-Protokoll, 'uebergabe' = Kunden-Übergabe
    CHECK(stage IN ('arbeit','uebergabe')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_service ON checklist_templates(service_id);
CREATE INDEX IF NOT EXISTS idx_checklist_category ON checklist_templates(category);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,              -- "Bremsflüssigkeit kontrolliert"
  hint TEXT,                        -- Zusatz-Erklärung
  required INTEGER NOT NULL DEFAULT 1,  -- muss abgehakt sein
  input_type TEXT NOT NULL DEFAULT 'check'
    CHECK(input_type IN ('check','text','number'))  -- Checkbox, Freitext, Messwert
);

CREATE INDEX IF NOT EXISTS idx_checkitems_tpl ON checklist_items(template_id);

-- Ergebnisse: pro Work-Log und Checklist-Item
CREATE TABLE IF NOT EXISTS work_log_checklist_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_log_id INTEGER NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  item_label TEXT NOT NULL,         -- Snapshot, falls Template später geändert wird
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK(status IN ('offen','ok','nicht_ok','nicht_relevant')),
  text_value TEXT,                  -- für input_type='text'|'number'
  note TEXT                         -- Notiz bei 'nicht_ok'
);

CREATE INDEX IF NOT EXISTS idx_results_worklog ON work_log_checklist_results(work_log_id);

-- ============ Übergabeprotokolle (Kunde nimmt Fahrzeug entgegen) ============

CREATE TABLE IF NOT EXISTS handover_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,

  handover_at TEXT,                   -- Datum/Uhrzeit der Übergabe
  handed_over_by INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- Mitarbeiter
  end_mileage INTEGER,                -- KM bei Übergabe

  -- Übergabe-Inhalte (alles optional, damit flexibel)
  keys_count INTEGER,                 -- Anzahl Schlüssel
  documents_returned TEXT,            -- Fahrzeugschein, TÜV-Bescheinigung etc. (Freitext)
  accessories_returned TEXT,          -- Reservereifen, Werkzeug, Radio-Code etc.

  -- Ergebnis + Zufriedenheit
  customer_feedback TEXT,             -- Anmerkungen des Kunden
  customer_satisfaction INTEGER,      -- 1..5
  complaints TEXT,                    -- beanstandete Mängel (falls vorhanden)

  -- Status
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK(status IN ('offen','uebergeben','unter_vorbehalt','verweigert')),
  notes TEXT,                         -- interne Notizen

  -- Unterschriften (PNG base64)
  customer_signature TEXT,            -- Kunden-Unterschrift
  customer_signature_name TEXT,       -- Klartext-Name des Unterschreibenden
  employee_signature TEXT,            -- Gegenzeichnung Werkstatt
  employee_signature_name TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_handover_appointment ON handover_logs(appointment_id);

CREATE TABLE IF NOT EXISTS handover_checklist_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handover_id INTEGER NOT NULL REFERENCES handover_logs(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  item_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK(status IN ('offen','ok','nicht_ok','nicht_relevant')),
  text_value TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_handover_results ON handover_checklist_results(handover_id);

-- ============ Audit (Änderungsprotokoll) ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  payload_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ============ Webhooks (externe Systeme / KI-Telefon) ============
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  description TEXT,
  secret TEXT,
  events TEXT NOT NULL DEFAULT '*',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ Ersatzteile / Material am Termin ============
CREATE TABLE IF NOT EXISTS appointment_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  part_number TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parts_appointment ON appointment_parts(appointment_id);

-- ============ Arbeitszeit-Stempel pro Termin ============
CREATE TABLE IF NOT EXISTS appointment_labor_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_labor_appointment ON appointment_labor_logs(appointment_id);

-- ============ Reifen-Einlagerung ============
CREATE TABLE IF NOT EXISTS tire_storage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lagertyp TEXT NOT NULL CHECK(lagertyp IN ('winter','sommer')),
  lagerort TEXT,
  quantity INTEGER NOT NULL DEFAULT 4,
  einlagerdatum TEXT,
  bemerkung TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_winter_reminder_year INTEGER,
  last_summer_reminder_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tire_vehicle ON tire_storage(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tire_customer ON tire_storage(customer_id);

-- ============ Annahme- / Auftragsfotos ============
CREATE TABLE IF NOT EXISTS appointment_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'annahme' CHECK(kind IN ('annahme','reparatur','uebergabe','sonstiges')),
  file_url TEXT NOT NULL,
  caption TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_media ON appointment_media(appointment_id);

-- ============ Mindest-Lager (Ersatzteile / Verbrauch) ============
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  min_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Stk',
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory_items(name);
`;

db.exec(schema);

// ===== Leichte Migrationen (für bereits bestehende DBs) =====
function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}
function addColumnIfMissing(table, column, ddl) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
addColumnIfMissing('services', 'buffer_minutes', 'buffer_minutes INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('services', 'required_bay_type', 'required_bay_type TEXT');
addColumnIfMissing('services', 'required_skills', 'required_skills TEXT');
addColumnIfMissing('services', 'online_bookable', 'online_bookable INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('services', 'internal_code', 'internal_code TEXT');
addColumnIfMissing('services', 'duration_min_minutes', 'duration_min_minutes INTEGER');
addColumnIfMissing('services', 'duration_max_minutes', 'duration_max_minutes INTEGER');
addColumnIfMissing('services', 'buffer_before_minutes', 'buffer_before_minutes INTEGER DEFAULT 0');
addColumnIfMissing('services', 'buffer_after_minutes', 'buffer_after_minutes INTEGER DEFAULT 0');
addColumnIfMissing('services', 'complexity', 'complexity INTEGER DEFAULT 2');
addColumnIfMissing('services', 'color', 'color TEXT');
addColumnIfMissing('services', 'notes', 'notes TEXT');
addColumnIfMissing('appointments', 'bay_id', 'bay_id INTEGER REFERENCES bays(id) ON DELETE SET NULL');
addColumnIfMissing('appointments', 'source', "source TEXT NOT NULL DEFAULT 'intern'");
addColumnIfMissing('appointments', 'confirmation_status', "confirmation_status TEXT NOT NULL DEFAULT 'bestaetigt'");
addColumnIfMissing('appointments', 'external_ref', 'external_ref TEXT');
addColumnIfMissing('appointments', 'api_key_id', 'api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL');
addColumnIfMissing('appointments', 'actual_start_time', 'actual_start_time TEXT');
addColumnIfMissing('appointments', 'actual_end_time', 'actual_end_time TEXT');
addColumnIfMissing('checklist_templates', 'stage', "stage TEXT NOT NULL DEFAULT 'arbeit'");
addColumnIfMissing('appointments', 'public_status_token', 'public_status_token TEXT');

// Eindeutige Status-Links für alle bestehenden Termine
{
  const rows = db.prepare('SELECT id FROM appointments WHERE public_status_token IS NULL OR TRIM(public_status_token) = ?').all('');
  for (const r of rows) {
    const tok = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE appointments SET public_status_token = ? WHERE id = ?').run(tok, r.id);
  }
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_public_token ON appointments(public_status_token)`);

// ===== Default-Ausgabenkategorien =====
const catCount = db.prepare('SELECT COUNT(*) AS c FROM expense_categories').get().c;
if (catCount === 0) {
  const insCat = db.prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)');
  [
    ['Ersatzteile', '#2563eb'],
    ['Werkzeug', '#7c3aed'],
    ['Verbrauchsmaterial', '#0891b2'],
    ['Miete', '#d97706'],
    ['Strom/Wasser', '#059669'],
    ['Versicherung', '#dc2626'],
    ['Marketing', '#ec4899'],
    ['Bürobedarf', '#64748b'],
    ['Fahrzeugkosten', '#ea580c'],
    ['Sonstiges', '#94a3b8'],
  ].forEach((c) => insCat.run(...c));
}

// ===== Default-Öffnungszeiten einsetzen (nur beim ersten Start) =====
const hoursCount = db.prepare('SELECT COUNT(*) AS c FROM workshop_hours').get().c;
if (hoursCount === 0) {
  const insH = db.prepare('INSERT INTO workshop_hours (weekday, open_time, close_time, closed) VALUES (?,?,?,?)');
  // Mo..Fr 09:00-18:00, Sa/So geschlossen
  for (let wd = 0; wd <= 4; wd++) insH.run(wd, '09:00', '18:00', 0);
  insH.run(5, null, null, 1);
  insH.run(6, null, null, 1);
}

export function ensureInitialAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return null;

  const password = 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, phone)
     VALUES (?, ?, ?, 'admin', ?)`
  ).run('admin@werkstatt.local', hash, 'Administrator', '030 40244 15');

  return { email: 'admin@werkstatt.local', password };
}

export default db;
