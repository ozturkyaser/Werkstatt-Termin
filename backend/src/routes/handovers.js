import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// --- Übergabe-Checklisten für einen Termin finden ---
function handoverChecklistsFor(appointmentId) {
  const svcRows = db.prepare(
    `SELECT asv.service_id, s.name, s.category
       FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id
      WHERE asv.appointment_id = ?`
  ).all(appointmentId);

  const templates = [];
  const seen = new Set();

  for (const row of svcRows) {
    const t1 = db.prepare(
      "SELECT * FROM checklist_templates WHERE active=1 AND stage='uebergabe' AND scope='service' AND service_id = ?"
    ).all(row.service_id);
    for (const t of t1) if (!seen.has(t.id)) { templates.push({ ...t, via: row.name }); seen.add(t.id); }

    const t2 = db.prepare(
      "SELECT * FROM checklist_templates WHERE active=1 AND stage='uebergabe' AND scope='category' AND lower(category) = lower(?)"
    ).all(row.category || '');
    for (const t of t2) if (!seen.has(t.id)) { templates.push({ ...t, via: row.category }); seen.add(t.id); }
  }

  const t3 = db.prepare("SELECT * FROM checklist_templates WHERE active=1 AND stage='uebergabe' AND scope='global'").all();
  for (const t of t3) if (!seen.has(t.id)) { templates.push({ ...t, via: 'global' }); seen.add(t.id); }

  for (const t of templates) {
    t.items = db.prepare('SELECT * FROM checklist_items WHERE template_id = ? ORDER BY position, id').all(t.id);
  }
  return templates;
}

router.get('/checklists/:appointmentId', (req, res) => {
  res.json(handoverChecklistsFor(req.params.appointmentId));
});

// --- Einzelnes Handover-Protokoll ---
function loadFull(appointmentId) {
  const h = db.prepare('SELECT * FROM handover_logs WHERE appointment_id = ?').get(appointmentId);
  if (!h) return null;
  h.results = db.prepare(
    `SELECT r.*, ci.label AS tpl_label, ci.input_type, ci.hint
       FROM handover_checklist_results r
       LEFT JOIN checklist_items ci ON ci.id = r.item_id
      WHERE r.handover_id = ?
      ORDER BY r.id`
  ).all(h.id);
  return h;
}

router.get('/by-appointment/:appointmentId', (req, res) => {
  const h = loadFull(req.params.appointmentId);
  if (!h) return res.json(null);
  res.json(h);
});

// --- Speichern (Create oder Update) ---
router.post('/save/:appointmentId', (req, res) => {
  const aid = Number(req.params.appointmentId);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(aid);
  if (!appt) return res.status(404).json({ error: 'Termin nicht gefunden' });

  const {
    end_mileage,
    keys_count, documents_returned, accessories_returned,
    customer_feedback, customer_satisfaction, complaints,
    notes, status = 'uebergeben',
    customer_signature, customer_signature_name,
    employee_signature, employee_signature_name,
    checklist = [],  // [{ item_id, status, text_value, note }]
    final = false,   // true = endgültig abgeschlossen
  } = req.body || {};

  if (final && !customer_signature) {
    return res.status(400).json({ error: 'Kunden-Unterschrift erforderlich' });
  }
  if (!['uebergeben', 'unter_vorbehalt', 'verweigert', 'offen'].includes(status)) {
    return res.status(400).json({ error: 'status ungültig' });
  }

  const now = final ? new Date().toISOString() : null;
  const existing = db.prepare('SELECT * FROM handover_logs WHERE appointment_id = ?').get(aid);
  let hid;

  const txn = db.transaction(() => {
    if (existing) {
      hid = existing.id;
      db.prepare(
        `UPDATE handover_logs SET
           handover_at = COALESCE(?, handover_at),
           handed_over_by = COALESCE(?, handed_over_by),
           end_mileage = ?, keys_count = ?, documents_returned = ?, accessories_returned = ?,
           customer_feedback = ?, customer_satisfaction = ?, complaints = ?,
           status = ?, notes = ?,
           customer_signature = ?, customer_signature_name = ?,
           employee_signature = ?, employee_signature_name = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        now, final ? (req.user?.id || null) : null,
        end_mileage ?? null, keys_count ?? null, documents_returned ?? null, accessories_returned ?? null,
        customer_feedback ?? null, customer_satisfaction ?? null, complaints ?? null,
        status, notes ?? null,
        customer_signature ?? null, customer_signature_name ?? null,
        employee_signature ?? null, employee_signature_name ?? null,
        hid
      );
    } else {
      const info = db.prepare(
        `INSERT INTO handover_logs
           (appointment_id, handover_at, handed_over_by, end_mileage,
            keys_count, documents_returned, accessories_returned,
            customer_feedback, customer_satisfaction, complaints,
            status, notes,
            customer_signature, customer_signature_name,
            employee_signature, employee_signature_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aid, now, final ? (req.user?.id || null) : null, end_mileage ?? null,
        keys_count ?? null, documents_returned ?? null, accessories_returned ?? null,
        customer_feedback ?? null, customer_satisfaction ?? null, complaints ?? null,
        status, notes ?? null,
        customer_signature ?? null, customer_signature_name ?? null,
        employee_signature ?? null, employee_signature_name ?? null
      );
      hid = info.lastInsertRowid;
    }

    // Checkliste speichern
    db.prepare('DELETE FROM handover_checklist_results WHERE handover_id = ?').run(hid);
    const ins = db.prepare(
      `INSERT INTO handover_checklist_results (handover_id, template_id, item_id, item_label, status, text_value, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of checklist) {
      const item = db.prepare('SELECT label, template_id FROM checklist_items WHERE id = ?').get(c.item_id);
      if (!item) continue;
      ins.run(hid, item.template_id, c.item_id, item.label, c.status || 'offen', c.text_value || null, c.note || null);
    }
  });
  txn();

  // Km-Stand zum Fahrzeug übernehmen, wenn größer
  if (end_mileage) {
    const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(appt.vehicle_id);
    if (v && (!v.mileage || end_mileage > v.mileage)) {
      db.prepare('UPDATE vehicles SET mileage = ? WHERE id = ?').run(Number(end_mileage), v.id);
    }
  }

  res.json(loadFull(aid));
});

// --- Admin: Protokoll löschen ---
router.delete('/:appointmentId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur Admin' });
  db.prepare('DELETE FROM handover_logs WHERE appointment_id = ?').run(req.params.appointmentId);
  res.json({ success: true });
});

// --- Druckbares Protokoll (HTML) ---
router.get('/print/:appointmentId', (req, res) => {
  const aid = req.params.appointmentId;
  const a = db.prepare(
    `SELECT a.*, c.first_name, c.last_name, c.address, c.phone AS customer_phone, c.email AS customer_email,
            v.license_plate, v.brand, v.model, v.vin, v.year AS vehicle_year, v.mileage
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       WHERE a.id = ?`
  ).get(aid);
  if (!a) return res.status(404).send('Termin nicht gefunden');

  const h = db.prepare(
    `SELECT h.*, u.full_name AS handed_over_by_name
       FROM handover_logs h
       LEFT JOIN users u ON u.id = h.handed_over_by
      WHERE h.appointment_id = ?`
  ).get(aid);
  if (!h) return res.status(404).send('Kein Übergabeprotokoll vorhanden');

  const results = db.prepare(
    `SELECT r.*, t.name AS template_name
       FROM handover_checklist_results r
       LEFT JOIN checklist_templates t ON t.id = r.template_id
      WHERE r.handover_id = ? ORDER BY t.name, r.id`
  ).all(h.id);

  const svcList = db.prepare(
    `SELECT s.name FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id WHERE asv.appointment_id = ?`
  ).all(aid).map((s) => s.name).join(', ');

  const groups = {};
  for (const r of results) {
    const k = r.template_name || 'Sonstiges';
    groups[k] = groups[k] || [];
    groups[k].push(r);
  }

  const statusBadge = {
    ok: '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;">✓ OK</span>',
    nicht_ok: '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;">✗ Nicht OK</span>',
    nicht_relevant: '<span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:4px;">n/a</span>',
    offen: '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;">offen</span>',
  };

  const statusMain = {
    uebergeben: ['#16a34a', 'Fahrzeug übergeben – ohne Beanstandung'],
    unter_vorbehalt: ['#d97706', 'Übergabe unter Vorbehalt (siehe Beanstandungen)'],
    verweigert: ['#dc2626', 'Abnahme verweigert'],
    offen: ['#64748b', 'Noch offen'],
  };
  const [mainCol, mainLabel] = statusMain[h.status] || ['#64748b', h.status];

  const workshop = process.env.WORKSHOP_NAME || 'Werkstatt';
  const formatDE = (iso) => { if (!iso) return '–'; return new Date(iso).toLocaleString('de-DE'); };
  const stars = (n) => n ? '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n))) : '–';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"/>
<title>Übergabeprotokoll – Termin ${aid}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;margin:30px;max-width:900px}
  h1{font-size:22px;margin:0 0 4px;} h2{font-size:16px;margin:22px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}
  h3{font-size:14px;margin:14px 0 6px;color:#334155}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;}
  th{background:#f8fafc;font-weight:600;}
  .hdr{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1f2937;padding-bottom:10px;margin-bottom:16px;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;}
  .meta div{padding:3px 0;}
  .meta strong{color:#475569;font-weight:500;display:inline-block;width:140px;}
  .box{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:12px 0;background:#fafbfc;}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;}
  .sig .field{border-bottom:1px solid #64748b;padding-bottom:6px;min-height:90px;}
  .status-bar{background:${mainCol};color:#fff;padding:10px 14px;border-radius:6px;font-weight:600;margin:14px 0;}
  @media print{ .no-print{display:none;} body{margin:15mm;} }
  .btn{background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;border:0;cursor:pointer;}
</style></head><body>
<button class="no-print btn" onclick="window.print()">🖨 Drucken</button>

<div class="hdr">
  <div>
    <h1>Fahrzeug-Übergabeprotokoll</h1>
    <div style="color:#64748b;font-size:13px;">${workshop}</div>
  </div>
  <div style="text-align:right;font-size:13px;color:#475569;">
    <div><strong>Protokoll-Nr.:</strong> UP-${String(aid).padStart(5,'0')}</div>
    <div><strong>Datum:</strong> ${formatDE(h.handover_at || h.created_at)}</div>
  </div>
</div>

<div class="status-bar">${mainLabel}</div>

<h2>Kunde & Fahrzeug</h2>
<div class="meta">
  <div><strong>Kunde:</strong> ${a.first_name || ''} ${a.last_name || ''}</div>
  <div><strong>Kennzeichen:</strong> ${a.license_plate || '–'}</div>
  <div><strong>Anschrift:</strong> ${a.address || '–'}</div>
  <div><strong>Fahrzeug:</strong> ${a.brand || ''} ${a.model || ''} ${a.vehicle_year ? '('+a.vehicle_year+')' : ''}</div>
  <div><strong>Telefon:</strong> ${a.customer_phone || '–'}</div>
  <div><strong>FIN:</strong> ${a.vin || '–'}</div>
  <div><strong>Ausgeführte Arbeiten:</strong> ${svcList}</div>
  <div><strong>Kilometerstand:</strong> ${h.end_mileage ? Number(h.end_mileage).toLocaleString('de-DE') + ' km' : '–'}</div>
</div>

<h2>Übergabe-Bestandteile</h2>
<table>
  <tr><th style="width:40%">Gegenstand</th><th>Menge / Beschreibung</th></tr>
  <tr><td>Anzahl Fahrzeug-Schlüssel</td><td>${h.keys_count ?? '–'}</td></tr>
  <tr><td>Fahrzeugpapiere</td><td>${escapeHtml(h.documents_returned) || '–'}</td></tr>
  <tr><td>Zubehör / persönliche Gegenstände</td><td>${escapeHtml(h.accessories_returned) || '–'}</td></tr>
</table>

<h2>Bestätigungen des Kunden</h2>
${Object.entries(groups).map(([name, items]) => `
  <h3>${name}</h3>
  <table>
    <tr><th style="width:60%">Punkt</th><th>Bestätigt</th><th>Anmerkung</th></tr>
    ${items.map((r) => `
      <tr>
        <td>${r.item_label}</td>
        <td>${statusBadge[r.status] || r.status}</td>
        <td>${[r.text_value, r.note].filter(Boolean).join(' · ') || ''}</td>
      </tr>
    `).join('')}
  </table>
`).join('') || '<div style="color:#888">Keine Punkte erfasst.</div>'}

${h.customer_satisfaction ? `
<h2>Kunden-Zufriedenheit</h2>
<div class="box">
  <div style="font-size:22px;color:#f59e0b;">${stars(h.customer_satisfaction)}</div>
  <div style="color:#64748b;font-size:12px;">${h.customer_satisfaction} von 5 Sternen</div>
</div>` : ''}

${h.customer_feedback ? `
<h2>Anmerkungen des Kunden</h2>
<div class="box" style="white-space:pre-wrap">${escapeHtml(h.customer_feedback)}</div>` : ''}

${h.complaints ? `
<h2 style="color:#dc2626">⚠ Beanstandungen</h2>
<div class="box" style="background:#fef2f2;border-color:#fecaca;white-space:pre-wrap">${escapeHtml(h.complaints)}</div>` : ''}

${h.notes ? `
<h2>Interne Notizen</h2>
<div class="box" style="white-space:pre-wrap;font-size:12px;color:#475569">${escapeHtml(h.notes)}</div>` : ''}

<h2>Unterschriften</h2>
<p style="font-size:12px;color:#64748b">
  Mit meiner Unterschrift bestätige ich die ordnungsgemäße Übergabe des Fahrzeugs, den Empfang der oben aufgeführten
  Schlüssel/Dokumente/Gegenstände sowie die Durchführung der aufgeführten Arbeiten. Bei einer Abnahme „unter Vorbehalt"
  gelten die unter „Beanstandungen" aufgeführten Mängel als vermerkt und nicht akzeptiert.
</p>
<div class="sig">
  <div>
    <div class="field">
      ${h.customer_signature ? `<img src="${h.customer_signature}" style="max-width:100%;max-height:90px;"/>` : ''}
    </div>
    <div style="font-size:12px;margin-top:4px;">Kunde: <strong>${h.customer_signature_name || (a.first_name + ' ' + a.last_name)}</strong></div>
    <div style="color:#94a3b8;font-size:11px;">am ${formatDE(h.handover_at)}</div>
  </div>
  <div>
    <div class="field">
      ${h.employee_signature ? `<img src="${h.employee_signature}" style="max-width:100%;max-height:90px;"/>` : ''}
    </div>
    <div style="font-size:12px;margin-top:4px;">Werkstatt: <strong>${h.employee_signature_name || h.handed_over_by_name || ''}</strong></div>
    <div style="color:#94a3b8;font-size:11px;">${workshop}</div>
  </div>
</div>

<div style="margin-top:26px;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;padding-top:8px;">
  Übergabeprotokoll Nr. UP-${String(aid).padStart(5,'0')} · erstellt mit Werkstatt-Terminplaner
</div>

</body></html>`);
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export default router;
