import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function loadFullTemplate(id) {
  const t = db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(id);
  if (!t) return null;
  t.items = db.prepare('SELECT * FROM checklist_items WHERE template_id = ? ORDER BY position, id').all(id);
  return t;
}

// Alle Templates (inkl. Item-Zahl), optional nach Stage filterbar
router.get('/templates', (req, res) => {
  const { stage } = req.query;
  const where = stage ? 'WHERE t.stage = ?' : '';
  const params = stage ? [stage] : [];
  const rows = db.prepare(
    `SELECT t.*, s.name AS service_name,
            (SELECT COUNT(*) FROM checklist_items i WHERE i.template_id = t.id) AS item_count
       FROM checklist_templates t
       LEFT JOIN services s ON s.id = t.service_id
       ${where}
       ORDER BY t.stage, t.scope, t.name`
  ).all(...params);
  res.json(rows);
});

// Einzelnes Template mit Items
router.get('/templates/:id', (req, res) => {
  const t = loadFullTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(t);
});

// Neu anlegen
router.post('/templates', requireRole('admin'), (req, res) => {
  const { name, scope = 'service', service_id = null, category = null, description = null, stage = 'arbeit', items = [] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  if (scope === 'service' && !service_id) return res.status(400).json({ error: 'service_id nötig' });
  if (scope === 'category' && !category) return res.status(400).json({ error: 'category nötig' });
  if (!['arbeit', 'uebergabe'].includes(stage)) return res.status(400).json({ error: 'stage ungültig' });

  const txn = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO checklist_templates (name, scope, service_id, category, description, stage)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, scope, service_id, category, description, stage);
    const tid = info.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO checklist_items (template_id, position, label, hint, required, input_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    items.forEach((it, i) => {
      ins.run(tid, i, it.label, it.hint || null, it.required === false ? 0 : 1, it.input_type || 'check');
    });
    return tid;
  });
  const tid = txn();
  res.status(201).json(loadFullTemplate(tid));
});

// Update (inkl. Items)
router.put('/templates/:id', requireRole('admin'), (req, res) => {
  const tid = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(tid);
  if (!ex) return res.status(404).json({ error: 'Nicht gefunden' });

  const { name, scope, service_id, category, description, stage, active, items } = req.body || {};
  db.prepare(
    `UPDATE checklist_templates SET
       name=COALESCE(?, name), scope=COALESCE(?, scope), service_id=?,
       category=?, description=?, stage=COALESCE(?, stage),
       active=COALESCE(?, active)
     WHERE id = ?`
  ).run(
    name ?? null, scope ?? null,
    service_id !== undefined ? service_id : ex.service_id,
    category !== undefined ? category : ex.category,
    description !== undefined ? description : ex.description,
    stage ?? null,
    active !== undefined ? (active ? 1 : 0) : null,
    tid
  );

  if (Array.isArray(items)) {
    db.prepare('DELETE FROM checklist_items WHERE template_id = ?').run(tid);
    const ins = db.prepare(
      `INSERT INTO checklist_items (template_id, position, label, hint, required, input_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    items.forEach((it, i) => {
      ins.run(tid, i, it.label, it.hint || null, it.required === false ? 0 : 1, it.input_type || 'check');
    });
  }

  res.json(loadFullTemplate(tid));
});

// Löschen
router.delete('/templates/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM checklist_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Standard-Checklisten laden (Seed)
router.post('/seed-defaults', requireRole('admin'), (req, res) => {
  const { mode = 'append' } = req.body || {};  // 'append' | 'reset'
  const defaults = getDefaultChecklists();

  let created = 0, skipped = 0, cleared = 0;

  const runSeed = db.transaction(() => {
    if (mode === 'reset') {
      const r = db.prepare('DELETE FROM checklist_templates').run();
      cleared = r.changes;
    }

    for (const d of defaults) {
      const stage = d.stage || 'arbeit';
      // Prüfen, ob Template (nach scope+category/name+stage) schon existiert
      let exists;
      if (d.scope === 'category') {
        exists = db.prepare(
          "SELECT id FROM checklist_templates WHERE scope='category' AND lower(category)=lower(?) AND stage=?"
        ).get(d.category, stage);
      } else if (d.scope === 'global') {
        exists = db.prepare(
          "SELECT id FROM checklist_templates WHERE scope='global' AND name=? AND stage=?"
        ).get(d.name, stage);
      }
      if (exists) { skipped++; continue; }

      const tid = db.prepare(
        `INSERT INTO checklist_templates (name, scope, service_id, category, description, stage)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(d.name, d.scope, null, d.category || null, d.description || null, stage).lastInsertRowid;

      const ins = db.prepare(
        `INSERT INTO checklist_items (template_id, position, label, hint, required, input_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      d.items.forEach((it, i) => {
        ins.run(tid, i, it.label, it.hint || null, it.required === false ? 0 : 1, it.input_type || 'check');
      });
      created++;
    }
  });
  runSeed();

  res.json({ created, skipped, cleared, total_defined: defaults.length });
});

// ============ STANDARD-CHECKLISTEN ============
export function getDefaultChecklists() {
  return [
    // --- Bremsen ---
    {
      name: 'Bremsen-Prüfung', scope: 'category', category: 'Bremsen',
      description: 'Standard-Kontrolle nach Bremsarbeiten',
      items: [
        { label: 'Bremsbeläge Stärke geprüft', hint: 'Min. 3 mm' },
        { label: 'Bremsscheiben: Riefen, Rost, Stärke' },
        { label: 'Bremsflüssigkeit Stand und Wassergehalt' },
        { label: 'Bremsleitungen / Schläuche sichtgeprüft' },
        { label: 'Handbremse Funktion' },
        { label: 'Probefahrt: Bremswirkung, keine Geräusche' },
        { label: 'Bremsweg / Schiefziehen', required: false },
        { label: 'Drehmoment Radbolzen geprüft' },
      ],
    },
    // --- Öl & Flüssigkeiten ---
    {
      name: 'Öl- & Flüssigkeiten-Kontrolle', scope: 'category', category: 'Öl & Flüssigkeiten',
      items: [
        { label: 'Öl-Qualität / Spezifikation korrekt' },
        { label: 'Ölmenge nach Herstellervorgabe' },
        { label: 'Ölfilter gewechselt' },
        { label: 'Ablassschraube + Dichtring erneuert' },
        { label: 'Drehmoment Ablassschraube' },
        { label: 'Keine Undichtigkeiten nach Probelauf' },
        { label: 'Altöl sachgerecht entsorgt' },
        { label: 'Service-Intervall-Anzeige zurückgesetzt', input_type: 'check', required: false },
        { label: 'Kilometerstand für nächsten Service', input_type: 'number', required: false },
      ],
    },
    // --- Reifen ---
    {
      name: 'Reifen-Service', scope: 'category', category: 'Reifen & Räder',
      items: [
        { label: 'Profiltiefe aller Reifen', hint: 'Min. 1,6 mm, Winter 4 mm' },
        { label: 'Reifendruck nach Herstellervorgabe' },
        { label: 'Felgen auf Schlag/Risse geprüft' },
        { label: 'RDKS angelernt / funktionsfähig' },
        { label: 'Drehmoment Radbolzen (gem. Hersteller)' },
        { label: 'Reifen-Sitz, Laufrichtung' },
        { label: 'Alte Reifen: Einlagerung/Entsorgung', required: false },
        { label: 'Auswuchtung durchgeführt' },
      ],
    },
    // --- Elektrik ---
    {
      name: 'Elektrik-Prüfung', scope: 'category', category: 'Elektrik & Elektronik',
      items: [
        { label: 'Batteriespannung', hint: 'Soll > 12,4 V', input_type: 'text' },
        { label: 'Polklemmen fest, Korrosion entfernt' },
        { label: 'Fehlerspeicher ausgelesen / gelöscht' },
        { label: 'Alle Warnleuchten aus' },
        { label: 'Relevante Systeme funktionsfähig' },
      ],
    },
    // --- Inspektion ---
    {
      name: 'Inspektion – Sicht-/Funktionsprüfung', scope: 'category', category: 'Inspektion & Wartung',
      items: [
        { label: 'Motorraum: Dichtheit, Leitungen, Schläuche' },
        { label: 'Flüssigkeitsstände (Öl, Kühl, Bremse, Scheibenw.)' },
        { label: 'Beleuchtung vollständig' },
        { label: 'Wischerblätter Funktion' },
        { label: 'Fahrwerk und Radaufhängung Sichtprüfung' },
        { label: 'Auspuff Sichtprüfung' },
        { label: 'Hebebühnen-Check: Bremse, Auspuff, Getriebe' },
        { label: 'Probefahrt gemacht' },
        { label: 'Fehlerspeicher ausgelesen' },
        { label: 'Serviceintervall zurückgesetzt', required: false },
        { label: 'Empfehlungen an Kunde', input_type: 'text', required: false },
      ],
    },
    // --- Klima ---
    {
      name: 'Klimaanlagen-Service', scope: 'category', category: 'Klimaanlage & Heizung',
      items: [
        { label: 'Kältemittel gewogen', input_type: 'text' },
        { label: 'Dichtheitsprüfung bestanden' },
        { label: 'Kompressor arbeitet geräuschfrei' },
        { label: 'Hoch- und Niederdruck i.O.', input_type: 'text' },
        { label: 'Klima kühlt ausreichend (Temperatur)', input_type: 'text' },
        { label: 'Innenraumfilter geprüft/gewechselt' },
      ],
    },
    // --- Fahrwerk ---
    {
      name: 'Fahrwerks-Kontrolle', scope: 'category', category: 'Fahrwerk & Lenkung',
      items: [
        { label: 'Spurstangenköpfe / Traggelenke Spiel' },
        { label: 'Querlenker / Silentlager Sichtprüfung' },
        { label: 'Stoßdämpfer Dichtheit' },
        { label: 'Radlager Geräusche / Spiel' },
        { label: 'Lenkung: Spiel, Funktion' },
        { label: 'Achsvermessung empfohlen', required: false, input_type: 'check' },
        { label: 'Probefahrt: Lenkverhalten, Geräusche' },
      ],
    },
    // --- HU / AU ---
    {
      name: 'HU/AU-Vorbereitung', scope: 'category', category: 'HU / AU & Prüfungen',
      items: [
        { label: 'Beleuchtung vollständig + korrekt eingestellt' },
        { label: 'Reifen + Bremsen HU-tauglich' },
        { label: 'Auspuff-Anlage dicht' },
        { label: 'Warndreieck, Warnweste, Verbandskasten vorhanden' },
        { label: 'Fehlerspeicher ausgelesen' },
        { label: 'Probefahrt ohne Auffälligkeit' },
        { label: 'Fahrzeug gereinigt für Prüfung', required: false },
      ],
    },
    // --- Karosserie ---
    {
      name: 'Karosserie-Arbeit – Abschluss', scope: 'category', category: 'Karosserie & Smart Repair',
      items: [
        { label: 'Farbton und Lack-Ergebnis kontrolliert' },
        { label: 'Spalt-/Passmaße' },
        { label: 'Dichtheit (bei Scheiben/Türen)' },
        { label: 'Reinigung und Übergabe-Qualität' },
      ],
    },
    // --- Globale Übergabe-Checkliste ---
    {
      name: 'Übergabe an Kunde (Allgemein)', scope: 'global',
      description: 'Immer bei Auftragsende durchgehen',
      items: [
        { label: 'Fahrzeug außen/innen sauber' },
        { label: 'Schlüssel + Dokumente bereit' },
        { label: 'Kunde informiert (Arbeiten, Empfehlungen)' },
        { label: 'Rechnung / Arbeitsschein übergeben', required: false },
        { label: 'Keine Werkzeuge/Fremdteile im Fahrzeug' },
      ],
    },

    // ===== ÜBERGABE-PROTOKOLLE (Kunde unterschreibt) =====

    // --- Globale Fahrzeug-Übergabe ---
    {
      name: 'Fahrzeug-Übergabe an Kunde', scope: 'global', stage: 'uebergabe',
      description: 'Wird bei der Auslieferung vom Kunden bestätigt',
      items: [
        { label: 'Fahrzeug-Schlüssel vollständig erhalten', hint: 'Anzahl wie bei Annahme' },
        { label: 'Fahrzeugschein (ZB I) erhalten' },
        { label: 'Zubehör / persönliche Gegenstände zurückerhalten', required: false },
        { label: 'Fahrzeug außen/innen sauber und unbeschädigt' },
        { label: 'Kilometerstand kontrolliert', input_type: 'number' },
        { label: 'Tankfüllstand wie bei Annahme', required: false },
        { label: 'Rechnung / Arbeitsschein erhalten' },
        { label: 'Ausgeführte Arbeiten erklärt bekommen' },
        { label: 'Kunden-Sichtkontrolle der Reparatur OK' },
      ],
    },
    // --- Reifen-Übergabe ---
    {
      name: 'Übergabe nach Reifenservice', scope: 'category', category: 'Reifen & Räder', stage: 'uebergabe',
      items: [
        { label: 'Alte Reifen eingelagert oder mitgegeben', required: false },
        { label: 'Einlagerungsschein erhalten', required: false },
        { label: 'Hinweis auf 50-km-Nachziehen erhalten' },
        { label: 'Luftdruck-Empfehlung erhalten', required: false },
      ],
    },
    // --- Bremsen-Übergabe ---
    {
      name: 'Übergabe nach Bremsenarbeit', scope: 'category', category: 'Bremsen', stage: 'uebergabe',
      items: [
        { label: 'Einfahr-Hinweis erhalten', hint: '200 km vorsichtig bremsen' },
        { label: 'Probefahrt vom Kunden gewünscht', required: false },
        { label: 'Garantie-Hinweis erhalten' },
      ],
    },
    // --- Öl/Inspektion-Übergabe ---
    {
      name: 'Übergabe nach Inspektion/Ölwechsel', scope: 'category', category: 'Inspektion & Wartung', stage: 'uebergabe',
      items: [
        { label: 'Scheckheft / Service-Plan aktualisiert' },
        { label: 'Nächster Service-Termin empfohlen', input_type: 'text' },
        { label: 'Service-Intervall-Anzeige zurückgesetzt' },
        { label: 'Empfehlungen für nächsten Besuch erhalten', required: false, input_type: 'text' },
      ],
    },
    // --- HU/AU-Übergabe ---
    {
      name: 'Übergabe nach HU/AU', scope: 'category', category: 'HU / AU & Prüfungen', stage: 'uebergabe',
      items: [
        { label: 'TÜV-Bescheinigung erhalten' },
        { label: 'Neue Prüfplakette am Kennzeichen angebracht' },
        { label: 'Prüfbericht erklärt bekommen', required: false },
      ],
    },
    // --- Klima-Übergabe ---
    {
      name: 'Übergabe nach Klimaservice', scope: 'category', category: 'Klimaanlage & Heizung', stage: 'uebergabe',
      items: [
        { label: 'Kälteleistung in Werkstatt getestet' },
        { label: 'Bei neuem Filter: Hinweis auf Wechselintervall' },
      ],
    },
  ];
}

export default router;
