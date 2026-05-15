import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizePlate, platesMatch } from '../services/ai.js';
import { dispatchWebhooks } from '../services/webhooks.js';
import { logAudit } from '../services/audit.js';

const router = Router();
router.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = path.resolve(__dirname, '..', '..', 'data', 'worklog-photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

/** Termine, deren Fahrzeug-Kennzeichen zum eingegebenen passt (für Abweichungs-Hinweis) */
function findAppointmentsByPlate(effectivePlate, excludeAppointmentId) {
  if (!effectivePlate) return [];
  const rows = db.prepare(
    `SELECT a.id, a.start_time, a.status, v.license_plate, v.brand, v.model,
            c.first_name, c.last_name
       FROM appointments a
       JOIN vehicles v ON v.id = a.vehicle_id
       JOIN customers c ON c.id = a.customer_id
      WHERE a.id != ? AND a.status NOT IN ('storniert')
        AND datetime(a.start_time) >= datetime('now', '-90 days')
      ORDER BY datetime(a.start_time) DESC
      LIMIT 400`
  ).all(excludeAppointmentId);
  return rows
    .filter((r) => platesMatch(effectivePlate, r.license_plate))
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      start_time: r.start_time,
      status: r.status,
      license_plate: r.license_plate,
      brand: r.brand,
      model: r.model,
      customer_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    }));
}

// Speichert Bild (data-URL) als Datei und liefert die URL zurück (als /api/work-logs/photos/xxx)
function saveDataUrlPhoto(dataUrl, prefix) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].split('/')[1].split('+')[0] || 'jpg';
  const fname = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, fname), Buffer.from(m[2], 'base64'));
  return `/api/work-logs/photos/${fname}`;
}

// Foto-Abrufe (im Handbuch / Druck-Ansicht)
router.get('/photos/:name', (req, res) => {
  const safe = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '');
  const p = path.join(PHOTO_DIR, safe);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// --- Work-Log für einen Termin laden ---
function loadFull(appointmentId) {
  const wl = db.prepare('SELECT * FROM work_logs WHERE appointment_id = ?').get(appointmentId);
  if (!wl) return null;
  wl.results = db.prepare(
    `SELECT r.*, ci.label AS tpl_label, ci.input_type, ci.hint
       FROM work_log_checklist_results r
       LEFT JOIN checklist_items ci ON ci.id = r.item_id
      WHERE r.work_log_id = ?
      ORDER BY r.id`
  ).all(wl.id);
  return wl;
}

router.get('/by-appointment/:appointmentId', (req, res) => {
  const wl = loadFull(req.params.appointmentId);
  if (!wl) return res.json(null);
  res.json(wl);
});

// --- Welche Checklisten gelten für diesen Termin? ---
function checklistsForAppointment(appointmentId) {
  const svcRows = db.prepare(
    `SELECT asv.service_id, s.name, s.category
       FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id
      WHERE asv.appointment_id = ?`
  ).all(appointmentId);

  const templates = [];
  const seen = new Set();

  for (const row of svcRows) {
    // 1. direkte Service-Checkliste
    const t1 = db.prepare(
      "SELECT * FROM checklist_templates WHERE active=1 AND stage='arbeit' AND scope='service' AND service_id = ?"
    ).all(row.service_id);
    for (const t of t1) if (!seen.has(t.id)) { templates.push({ ...t, via: row.name }); seen.add(t.id); }

    // 2. Kategorien-Checkliste
    const t2 = db.prepare(
      "SELECT * FROM checklist_templates WHERE active=1 AND stage='arbeit' AND scope='category' AND lower(category) = lower(?)"
    ).all(row.category || '');
    for (const t of t2) if (!seen.has(t.id)) { templates.push({ ...t, via: row.category }); seen.add(t.id); }
  }

  // 3. globale Checklisten
  const t3 = db.prepare("SELECT * FROM checklist_templates WHERE active=1 AND stage='arbeit' AND scope='global'").all();
  for (const t of t3) if (!seen.has(t.id)) { templates.push({ ...t, via: 'global' }); seen.add(t.id); }

  // Items ergänzen
  for (const t of templates) {
    t.items = db.prepare('SELECT * FROM checklist_items WHERE template_id = ? ORDER BY position, id').all(t.id);
  }
  return templates;
}

router.get('/checklists/:appointmentId', (req, res) => {
  res.json(checklistsForAppointment(req.params.appointmentId));
});

// --- Arbeit starten ---
router.post('/start/:appointmentId', (req, res) => {
  const aid = Number(req.params.appointmentId);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(aid);
  if (!appt) return res.status(404).json({ error: 'Termin nicht gefunden' });

  const { photo, plate_input, plate_ai, mileage, confirm_wrong_plate = false } = req.body || {};
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(appt.vehicle_id);
  const effectivePlate = normalizePlate(plate_input || plate_ai);
  const matches = effectivePlate && vehicle?.license_plate
    ? platesMatch(effectivePlate, vehicle.license_plate)
    : null;

  if (matches === false && !confirm_wrong_plate) {
    const candidates = findAppointmentsByPlate(effectivePlate, aid);
    return res.status(409).json({
      error: 'Kennzeichen stimmt nicht mit diesem Auftrag (Termin) überein.',
      code: 'PLATE_MISMATCH',
      expected_plate: vehicle?.license_plate || null,
      entered_plate: plate_input || plate_ai || effectivePlate,
      appointment_id: aid,
      candidates,
    });
  }

  const photoUrl = saveDataUrlPhoto(photo, `start-${aid}`);
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM work_logs WHERE appointment_id = ?').get(aid);
  if (existing) {
    db.prepare(
      `UPDATE work_logs SET started_at=?, started_by=?, start_plate_input=?, start_plate_ai=?,
         start_plate_match=?, start_photo=?, start_mileage=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      now, req.user?.id || null,
      plate_input || null, plate_ai || null,
      matches === null ? null : (matches ? 1 : 0),
      photoUrl, mileage || null, existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO work_logs (appointment_id, started_at, started_by,
         start_plate_input, start_plate_ai, start_plate_match, start_photo, start_mileage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      aid, now, req.user?.id || null,
      plate_input || null, plate_ai || null,
      matches === null ? null : (matches ? 1 : 0),
      photoUrl, mileage || null
    );
  }

  // Termin-Status auf "in_arbeit" (falls nicht schon)
  if (appt.status !== 'in_arbeit' && appt.status !== 'abgeschlossen') {
    const prev = appt.status;
    db.prepare("UPDATE appointments SET status='in_arbeit', actual_start_time=COALESCE(actual_start_time,?) WHERE id=?").run(now, aid);
    dispatchWebhooks('appointment.status_changed', {
      appointment_id: aid,
      old_status: prev,
      new_status: 'in_arbeit',
      reason: 'work_log_start',
    });
  }
  logAudit({
    userId: req.user?.id,
    action: 'work_log.start',
    entityType: 'appointment',
    entityId: aid,
  });
  // Kilometerstand ans Fahrzeug übernehmen (wenn größer)
  if (mileage && vehicle && (!vehicle.mileage || mileage > vehicle.mileage)) {
    db.prepare('UPDATE vehicles SET mileage=? WHERE id=?').run(Number(mileage), vehicle.id);
  }

  res.json(loadFull(aid));
});

// --- Arbeit beenden ---
router.post('/finish/:appointmentId', (req, res) => {
  const aid = Number(req.params.appointmentId);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(aid);
  if (!appt) return res.status(404).json({ error: 'Termin nicht gefunden' });

  const wl = db.prepare('SELECT * FROM work_logs WHERE appointment_id = ?').get(aid);
  if (!wl) return res.status(400).json({ error: 'Arbeit wurde noch nicht gestartet' });

  const {
    photo, plate_input, plate_ai, mileage,
    notes, signature_data, signature_name,
    checklist = [], // [{ item_id, status, text_value, note }]
    force_finish = false,
    confirm_wrong_plate = false,
  } = req.body || {};

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(appt.vehicle_id);
  const effectivePlate = normalizePlate(plate_input || plate_ai);
  const matches = effectivePlate && vehicle?.license_plate
    ? platesMatch(effectivePlate, vehicle.license_plate)
    : null;

  if (matches === false && !confirm_wrong_plate) {
    const candidates = findAppointmentsByPlate(effectivePlate, aid);
    return res.status(409).json({
      error: 'Kennzeichen stimmt nicht mit diesem Auftrag (Termin) überein.',
      code: 'PLATE_MISMATCH',
      expected_plate: vehicle?.license_plate || null,
      entered_plate: plate_input || plate_ai || effectivePlate,
      appointment_id: aid,
      candidates,
    });
  }

  // Checkliste validieren
  const templates = checklistsForAppointment(aid);
  const requiredMissing = [];
  const seenItemIds = new Set(checklist.map((c) => Number(c.item_id)));
  for (const tpl of templates) {
    for (const it of tpl.items) {
      if (it.required && !seenItemIds.has(it.id)) {
        requiredMissing.push(it.label);
      }
    }
  }
  const nichtOks = checklist.filter((c) => c.status === 'nicht_ok').length;
  const offene = checklist.filter((c) => c.status === 'offen' || !c.status).length;

  if ((requiredMissing.length > 0 || offene > 0) && !force_finish) {
    return res.status(400).json({
      error: 'Pflicht-Prüfpunkte fehlen',
      missing: requiredMissing,
      open_count: offene,
    });
  }

  const checklistStatus = nichtOks > 0 ? 'maengel' : (offene > 0 ? 'nicht_freigegeben' : 'ok');
  const photoUrl = saveDataUrlPhoto(photo, `end-${aid}`);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE work_logs SET ended_at=?, ended_by=?, end_plate_input=?, end_plate_ai=?, end_plate_match=?,
       end_photo=?, end_mileage=?, notes=?, signature_data=?, signature_name=?,
       checklist_status=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    now, req.user?.id || null,
    plate_input || null, plate_ai || null,
    matches === null ? null : (matches ? 1 : 0),
    photoUrl, mileage || null,
    notes || null, signature_data || null, signature_name || null,
    checklistStatus, wl.id
  );

  // Checklist-Ergebnisse speichern (erst alle alten löschen, dann neu)
  db.prepare('DELETE FROM work_log_checklist_results WHERE work_log_id = ?').run(wl.id);
  const insResult = db.prepare(
    `INSERT INTO work_log_checklist_results (work_log_id, template_id, item_id, item_label, status, text_value, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const txn = db.transaction((items) => {
    for (const c of items) {
      const item = db.prepare('SELECT label, template_id FROM checklist_items WHERE id = ?').get(c.item_id);
      if (!item) continue;
      insResult.run(
        wl.id, item.template_id, c.item_id, item.label,
        c.status || 'offen',
        c.text_value || null,
        c.note || null
      );
    }
  });
  txn(checklist);

  // Termin auf abgeschlossen
  const statusBefore = appt.status;
  db.prepare("UPDATE appointments SET status='abgeschlossen', actual_end_time=? WHERE id=?").run(now, aid);
  if (statusBefore !== 'abgeschlossen') {
    dispatchWebhooks('appointment.status_changed', {
      appointment_id: aid,
      old_status: statusBefore,
      new_status: 'abgeschlossen',
      reason: 'work_log_finish',
    });
  }
  logAudit({
    userId: req.user?.id,
    action: 'work_log.finish',
    entityType: 'appointment',
    entityId: aid,
  });

  // Mileage übernehmen
  if (mileage && vehicle && (!vehicle.mileage || mileage > vehicle.mileage)) {
    db.prepare('UPDATE vehicles SET mileage=? WHERE id=?').run(Number(mileage), vehicle.id);
  }

  res.json(loadFull(aid));
});

// --- Rollback (Admin): Work-Log löschen und Termin wieder "in_arbeit" ---
router.delete('/:appointmentId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur Admin' });
  db.prepare('DELETE FROM work_logs WHERE appointment_id = ?').run(req.params.appointmentId);
  res.json({ success: true });
});

// --- Druckfähiges Protokoll (HTML) ---
router.get('/print/:appointmentId', (req, res) => {
  const aid = req.params.appointmentId;
  const a = db.prepare(
    `SELECT a.*, c.first_name, c.last_name, c.address, c.phone AS customer_phone,
            v.license_plate, v.brand, v.model, v.vin, v.year AS vehicle_year, v.mileage,
            u.full_name AS employee_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN users u ON u.id = a.employee_id
       WHERE a.id = ?`
  ).get(aid);
  if (!a) return res.status(404).send('Termin nicht gefunden');

  const wl = db.prepare('SELECT w.*, us.full_name AS started_by_name, ue.full_name AS ended_by_name FROM work_logs w LEFT JOIN users us ON us.id = w.started_by LEFT JOIN users ue ON ue.id = w.ended_by WHERE appointment_id = ?').get(aid);
  if (!wl) return res.status(404).send('Kein Protokoll vorhanden');

  const results = db.prepare(
    `SELECT r.*, t.name AS template_name
       FROM work_log_checklist_results r
       LEFT JOIN checklist_templates t ON t.id = r.template_id
      WHERE r.work_log_id = ? ORDER BY t.name, r.id`
  ).all(wl.id);

  const svcList = db.prepare(
    `SELECT s.name FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id WHERE asv.appointment_id = ?`
  ).all(aid).map((s) => s.name).join(', ');

  // Gruppieren nach Template
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

  const img = (url) => url ? `<img src="${url}" style="max-width:45%;max-height:220px;border:1px solid #ddd;border-radius:6px;margin:4px;"/>` : '<div style="color:#888;font-style:italic">Kein Foto</div>';
  const workshop = process.env.WORKSHOP_NAME || 'Werkstatt';
  const formatDE = (iso) => {
    if (!iso) return '–';
    const d = new Date(iso);
    return d.toLocaleString('de-DE');
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"/>
<title>Arbeitsprotokoll – Termin ${aid}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;margin:30px;max-width:900px}
  h1{font-size:22px;margin:0 0 4px;} h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}
  h3{font-size:14px;margin:16px 0 6px;color:#334155}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;}
  th{background:#f8fafc;font-weight:600;}
  .hdr{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1f2937;padding-bottom:10px;margin-bottom:16px;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;}
  .meta div{padding:3px 0;}
  .meta strong{color:#475569;font-weight:500;display:inline-block;width:140px;}
  .box{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:12px 0;background:#fafbfc;}
  .signature{margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;}
  @media print{ .no-print{display:none;} body{margin:15mm;} }
  .btn{background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;border:0;cursor:pointer;}
</style></head><body>
<button class="no-print btn" onclick="window.print()">🖨 Drucken</button>
<div class="hdr">
  <div>
    <h1>Arbeitsprotokoll</h1>
    <div style="color:#64748b;font-size:13px;">${workshop}</div>
  </div>
  <div style="text-align:right;font-size:13px;color:#475569;">
    <div><strong>Protokoll-Nr.:</strong> WP-${String(aid).padStart(5,'0')}</div>
    <div><strong>Erstellt:</strong> ${formatDE(wl.created_at)}</div>
  </div>
</div>

<h2>Auftrag</h2>
<div class="meta">
  <div><strong>Kunde:</strong> ${a.first_name || ''} ${a.last_name || ''}</div>
  <div><strong>Kennzeichen:</strong> ${a.license_plate || '–'}</div>
  <div><strong>Fahrzeug:</strong> ${a.brand || ''} ${a.model || ''} ${a.vehicle_year ? '('+a.vehicle_year+')' : ''}</div>
  <div><strong>FIN:</strong> ${a.vin || '–'}</div>
  <div><strong>Leistungen:</strong> ${svcList}</div>
  <div><strong>Mitarbeiter:</strong> ${a.employee_name || '–'}</div>
</div>

<h2>Zeitstempel & Kilometerstand</h2>
<table>
  <tr><th>Ereignis</th><th>Zeit</th><th>Durch</th><th>KM</th><th>Kennzeichen (erfasst)</th><th>Abgleich</th></tr>
  <tr>
    <td>Start</td>
    <td>${formatDE(wl.started_at)}</td>
    <td>${wl.started_by_name || '–'}</td>
    <td>${wl.start_mileage || '–'}</td>
    <td>${wl.start_plate_input || wl.start_plate_ai || '–'}</td>
    <td>${wl.start_plate_match === 1 ? '✓' : wl.start_plate_match === 0 ? '✗' : '–'}</td>
  </tr>
  <tr>
    <td>Ende</td>
    <td>${formatDE(wl.ended_at)}</td>
    <td>${wl.ended_by_name || '–'}</td>
    <td>${wl.end_mileage || '–'}</td>
    <td>${wl.end_plate_input || wl.end_plate_ai || '–'}</td>
    <td>${wl.end_plate_match === 1 ? '✓' : wl.end_plate_match === 0 ? '✗' : '–'}</td>
  </tr>
</table>

<h2>Fotos</h2>
<div>${img(wl.start_photo)}${img(wl.end_photo)}</div>

<h2>Prüf-Checkliste</h2>
${Object.entries(groups).map(([name, items]) => `
  <h3>${name}</h3>
  <table>
    <tr><th style="width:60%">Prüfpunkt</th><th>Status</th><th>Wert / Notiz</th></tr>
    ${items.map((r) => `
      <tr>
        <td>${r.item_label}</td>
        <td>${statusBadge[r.status] || r.status}</td>
        <td>${[r.text_value, r.note].filter(Boolean).join(' · ') || ''}</td>
      </tr>
    `).join('')}
  </table>
`).join('') || '<div style="color:#888">Keine Prüfliste abgearbeitet.</div>'}

${wl.notes ? `<h2>Anmerkungen des Mitarbeiters</h2><div class="box" style="white-space:pre-wrap">${escapeHtml(wl.notes)}</div>` : ''}

<div class="signature">
  <h3>Digitale Unterschrift Mitarbeiter</h3>
  ${wl.signature_data ? `<img src="${wl.signature_data}" style="max-width:300px;border:1px solid #e5e7eb;border-radius:6px;background:#fff"/>` : '<div style="color:#888">Keine Unterschrift</div>'}
  <div style="margin-top:4px;font-size:13px;">${wl.signature_name || wl.ended_by_name || ''}</div>
  <div style="color:#94a3b8;font-size:11px;">Unterzeichnet am ${formatDE(wl.ended_at)}</div>
</div>

<div style="margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;padding-top:8px;">
  Gesamtstatus: <strong>${wl.checklist_status?.toUpperCase() || '–'}</strong> ·
  Erstellt mit Werkstatt-Terminplaner
</div>

</body></html>`);
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export default router;
