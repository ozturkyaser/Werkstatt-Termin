import db, { ensureInitialAdmin } from './db.js';
import { hashPassword } from './auth.js';

const services = [
  { name: 'Inspektion & Wartung', category: 'Wartung', duration_minutes: 120, price: 180,
    description: 'Inspektion nach Herstellervorgaben – Garantie bleibt erhalten.' },
  { name: 'Ölwechsel & Filter', category: 'Wartung', duration_minutes: 45, price: 89,
    description: 'Motoröl- und Filterwechsel für langen Motorlauf.' },
  { name: 'HU / TÜV Vorbereitung', category: 'Prüfung', duration_minutes: 60, price: 79,
    description: 'Haupt- & Abgasuntersuchung direkt im Haus.' },
  { name: 'HU / AU Durchführung', category: 'Prüfung', duration_minutes: 45, price: 129 },
  { name: 'Klimaanlagenservice', category: 'Komfort', duration_minutes: 60, price: 99,
    description: 'Reinigung, Befüllung und Funktionsprüfung.' },
  { name: 'Reifenwechsel', category: 'Reifen & Felgen', duration_minutes: 30, price: 39 },
  { name: 'Reifenmontage (4 Reifen)', category: 'Reifen & Felgen', duration_minutes: 60, price: 89 },
  { name: 'Achsvermessung', category: 'Fahrwerk', duration_minutes: 60, price: 89 },
  { name: 'Bremsenservice (vorn)', category: 'Bremsen & Fahrwerk', duration_minutes: 90, price: 199 },
  { name: 'Bremsenservice (hinten)', category: 'Bremsen & Fahrwerk', duration_minutes: 90, price: 179 },
  { name: 'Bremsflüssigkeitswechsel', category: 'Bremsen & Fahrwerk', duration_minutes: 45, price: 69 },
  { name: 'Fehlerdiagnose', category: 'Diagnose', duration_minutes: 60, price: 79,
    description: 'OBD-Diagnose & Fehlersuche.' },
  { name: 'Motorreparatur', category: 'Motor & Getriebe', duration_minutes: 240, price: 0,
    description: 'Diagnose, Reparatur, Austausch – auf Anfrage.' },
  { name: 'Getriebereparatur', category: 'Motor & Getriebe', duration_minutes: 240, price: 0 },
  { name: 'Unfallreparatur / Karosserie', category: 'Karosserie', duration_minutes: 480, price: 0,
    description: 'Karosserie, Lack, Versicherungsabwicklung.' },
  { name: 'Hol- & Bringservice', category: 'Service', duration_minutes: 30, price: 29 },
  { name: 'EV / Hochvolt-Service', category: 'Elektrofahrzeuge', duration_minutes: 120, price: 149,
    description: 'Zertifizierte Werkstatt für Elektrofahrzeuge (HV-Schein).' },
];

const admin = ensureInitialAdmin();

const exists = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (exists === 0) {
  const ins = db.prepare(
    `INSERT INTO services (name, description, category, duration_minutes, price, active)
     VALUES (?, ?, ?, ?, ?, 1)`
  );
  const tx = db.transaction(() => {
    for (const s of services) {
      ins.run(s.name, s.description || null, s.category, s.duration_minutes, s.price);
    }
  });
  tx();
  console.log(`✓ ${services.length} Dienstleistungen angelegt`);
} else {
  console.log('• Dienstleistungen bereits vorhanden – übersprungen');
}

const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount < 2) {
  db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, full_name, role, phone)
     VALUES (?, ?, ?, 'mitarbeiter', ?)`
  ).run('mitarbeiter@werkstatt.local', hashPassword('meister123'), 'Max Mustermann (Meister)', '030 40244 15');
  console.log('✓ Beispiel-Mitarbeiter angelegt: mitarbeiter@werkstatt.local / meister123');
}

if (admin) {
  console.log('\n✅ Admin-Zugang erstellt:');
  console.log(`   E-Mail:  ${admin.email}`);
  console.log(`   Passwort: ${admin.password}`);
  console.log('   >> Bitte nach dem ersten Login ändern!\n');
} else {
  console.log('• Admin-Konto bereits vorhanden');
}

console.log('✓ Seed abgeschlossen.');
process.exit(0);
