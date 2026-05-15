import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSetting } from '../services/settings.js';

const router = Router();
router.use(requireAuth);

const PREFIX = {
  angebot: 'AN',
  rechnung: 'RE',
  storno: 'ST',
  gutschrift: 'GS',
};

function nextDocNumber(type) {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT last_number FROM document_counters WHERE year=? AND type=?').get(year, type);
  const next = (row?.last_number || 0) + 1;
  if (row) {
    db.prepare('UPDATE document_counters SET last_number=? WHERE year=? AND type=?').run(next, year, type);
  } else {
    db.prepare('INSERT INTO document_counters (year, type, last_number) VALUES (?, ?, ?)').run(year, type, next);
  }
  return `${PREFIX[type]}-${year}-${String(next).padStart(4, '0')}`;
}

function calcTotals(items, taxRate) {
  let subtotal = 0;
  const normalized = items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unit_price) || 0;
    const disc = Number(it.discount_pct) || 0;
    const lineTotal = Math.round(qty * unit * (1 - disc / 100) * 100) / 100;
    subtotal += lineTotal;
    return {
      position: i + 1,
      service_id: it.service_id || null,
      description: (it.description || '').toString(),
      quantity: qty,
      unit: it.unit || 'Stk.',
      unit_price: unit,
      discount_pct: disc,
      line_total_net: lineTotal,
    };
  });
  const tax = Math.round(subtotal * (Number(taxRate) || 0) / 100 * 100) / 100;
  const gross = Math.round((subtotal + tax) * 100) / 100;
  return { items: normalized, subtotal_net: Math.round(subtotal * 100) / 100, tax_amount: tax, total_gross: gross };
}

function loadFull(id) {
  const doc = db.prepare(
    `SELECT d.*,
            c.first_name, c.last_name, c.email, c.phone, c.address,
            v.license_plate, v.brand, v.model, v.vin, v.year AS vehicle_year
     FROM documents d
     LEFT JOIN customers c ON c.id = d.customer_id
     LEFT JOIN vehicles  v ON v.id = d.vehicle_id
     WHERE d.id = ?`
  ).get(id);
  if (!doc) return null;
  const items = db.prepare('SELECT * FROM document_items WHERE document_id = ? ORDER BY position').all(id);
  return { ...doc, items };
}

// ---------- LIST ----------
router.get('/', (req, res) => {
  const { type, status, customer_id, from, to, q } = req.query;
  const where = [];
  const params = [];
  if (type) { where.push('d.type = ?'); params.push(type); }
  if (status) { where.push('d.status = ?'); params.push(status); }
  if (customer_id) { where.push('d.customer_id = ?'); params.push(customer_id); }
  if (from) { where.push('d.issue_date >= ?'); params.push(from); }
  if (to) { where.push('d.issue_date <= ?'); params.push(to); }
  if (q) {
    where.push('(d.doc_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)');
    const p = `%${q}%`;
    params.push(p, p, p);
  }
  const sql = `
    SELECT d.id, d.doc_number, d.type, d.status, d.issue_date, d.due_date, d.paid_amount,
           d.subtotal_net, d.tax_amount, d.total_gross, d.tax_rate,
           c.first_name, c.last_name,
           v.license_plate
    FROM documents d
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN vehicles  v ON v.id = d.vehicle_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY d.issue_date DESC, d.id DESC
  `;
  res.json(db.prepare(sql).all(...params));
});

// ---------- STATS ----------
router.get('/stats/summary', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const rows = db.prepare(
    `SELECT type, status,
            COUNT(*) AS count,
            SUM(total_gross) AS total_gross,
            SUM(paid_amount) AS total_paid
     FROM documents
     WHERE strftime('%Y', issue_date) = ?
     GROUP BY type, status`
  ).all(String(year));
  res.json({ year, rows });
});

// ---------- GET ONE ----------
router.get('/:id', (req, res) => {
  const d = loadFull(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dokument nicht gefunden' });
  res.json(d);
});

// ---------- PRINT (HTML-Druckansicht) ----------
router.get('/:id/print', (req, res) => {
  const d = loadFull(req.params.id);
  if (!d) return res.status(404).send('Nicht gefunden');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderDocumentHtml(d));
});

// ---------- CREATE ----------
router.post('/', requireRole('admin'), (req, res) => {
  const {
    type, customer_id, vehicle_id, appointment_id, related_document_id,
    issue_date, due_date, notes, internal_notes, payment_method, tax_rate = 19,
    items = [], status,
  } = req.body || {};

  if (!type || !PREFIX[type]) return res.status(400).json({ error: 'Typ ungültig' });
  if (!customer_id) return res.status(400).json({ error: 'Kunde fehlt' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Mindestens eine Position' });

  const { items: normItems, subtotal_net, tax_amount, total_gross } = calcTotals(items, tax_rate);

  const insert = db.transaction(() => {
    const doc_number = nextDocNumber(type);
    const r = db.prepare(
      `INSERT INTO documents
        (doc_number, type, status, customer_id, vehicle_id, appointment_id, related_document_id,
         issue_date, due_date, payment_method, subtotal_net, tax_rate, tax_amount, total_gross,
         notes, internal_notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc_number,
      type,
      status || (type === 'angebot' ? 'entwurf' : type === 'rechnung' ? 'offen' : type === 'storno' ? 'storniert' : 'offen'),
      customer_id,
      vehicle_id || null,
      appointment_id || null,
      related_document_id || null,
      issue_date || new Date().toISOString().slice(0, 10),
      due_date || null,
      payment_method || null,
      subtotal_net,
      tax_rate,
      tax_amount,
      total_gross,
      notes || null,
      internal_notes || null,
      req.user?.id || null
    );
    const itemStmt = db.prepare(
      `INSERT INTO document_items
        (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    normItems.forEach((it) => {
      itemStmt.run(
        r.lastInsertRowid,
        it.position, it.service_id, it.description,
        it.quantity, it.unit, it.unit_price, it.discount_pct, it.line_total_net
      );
    });
    return r.lastInsertRowid;
  });

  const id = insert();
  res.status(201).json(loadFull(id));
});

// ---------- UPDATE ----------
router.put('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  const {
    customer_id, vehicle_id, appointment_id, issue_date, due_date, notes,
    internal_notes, payment_method, tax_rate, items, status, paid_amount, payment_date,
  } = req.body || {};

  let totals = null;
  if (Array.isArray(items)) {
    totals = calcTotals(items, tax_rate ?? existing.tax_rate);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE documents
          SET customer_id = COALESCE(?, customer_id),
              vehicle_id = ?,
              appointment_id = ?,
              issue_date = COALESCE(?, issue_date),
              due_date = ?,
              notes = ?,
              internal_notes = ?,
              payment_method = ?,
              tax_rate = COALESCE(?, tax_rate),
              status = COALESCE(?, status),
              paid_amount = COALESCE(?, paid_amount),
              payment_date = ?,
              subtotal_net = COALESCE(?, subtotal_net),
              tax_amount = COALESCE(?, tax_amount),
              total_gross = COALESCE(?, total_gross),
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(
      customer_id ?? null,
      vehicle_id ?? null,
      appointment_id ?? null,
      issue_date ?? null,
      due_date ?? null,
      notes ?? null,
      internal_notes ?? null,
      payment_method ?? null,
      tax_rate ?? null,
      status ?? null,
      paid_amount ?? null,
      payment_date ?? null,
      totals?.subtotal_net ?? null,
      totals?.tax_amount ?? null,
      totals?.total_gross ?? null,
      req.params.id
    );

    if (totals) {
      db.prepare('DELETE FROM document_items WHERE document_id = ?').run(req.params.id);
      const stmt = db.prepare(
        `INSERT INTO document_items
          (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      totals.items.forEach((it) =>
        stmt.run(req.params.id, it.position, it.service_id, it.description, it.quantity, it.unit, it.unit_price, it.discount_pct, it.line_total_net)
      );
    }
  });
  tx();

  res.json(loadFull(req.params.id));
});

// ---------- DELETE ----------
router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
  // Entwürfe und Angebote dürfen hart gelöscht werden, gebuchte Rechnungen nur stornieren
  if (existing.type === 'rechnung' && existing.status !== 'entwurf') {
    return res.status(400).json({ error: 'Gebuchte Rechnungen können nicht gelöscht, nur storniert werden' });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------- STORNO ----------
router.post('/:id/storno', requireRole('admin'), (req, res) => {
  const orig = loadFull(req.params.id);
  if (!orig) return res.status(404).json({ error: 'Nicht gefunden' });
  if (orig.type !== 'rechnung') return res.status(400).json({ error: 'Nur Rechnungen können storniert werden' });
  if (orig.status === 'storniert') return res.status(400).json({ error: 'Bereits storniert' });

  const tx = db.transaction(() => {
    const doc_number = nextDocNumber('storno');
    const r = db.prepare(
      `INSERT INTO documents
        (doc_number, type, status, customer_id, vehicle_id, appointment_id, related_document_id,
         issue_date, subtotal_net, tax_rate, tax_amount, total_gross, notes, created_by)
       VALUES (?, 'storno', 'storniert', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc_number, orig.customer_id, orig.vehicle_id, orig.appointment_id, orig.id,
      new Date().toISOString().slice(0, 10),
      -orig.subtotal_net, orig.tax_rate, -orig.tax_amount, -orig.total_gross,
      `Storno zu ${orig.doc_number}`, req.user?.id || null
    );
    const stmt = db.prepare(
      `INSERT INTO document_items (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    orig.items.forEach((it, i) =>
      stmt.run(r.lastInsertRowid, i + 1, it.service_id, `STORNO: ${it.description}`, -it.quantity, it.unit, it.unit_price, it.discount_pct, -it.line_total_net)
    );
    db.prepare('UPDATE documents SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('storniert', orig.id);
    return r.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json(loadFull(id));
});

// ---------- ANGEBOT → RECHNUNG ----------
router.post('/:id/convert-to-invoice', requireRole('admin'), (req, res) => {
  const orig = loadFull(req.params.id);
  if (!orig) return res.status(404).json({ error: 'Nicht gefunden' });
  if (orig.type !== 'angebot') return res.status(400).json({ error: 'Nur Angebote können umgewandelt werden' });

  const tx = db.transaction(() => {
    const doc_number = nextDocNumber('rechnung');
    const r = db.prepare(
      `INSERT INTO documents
        (doc_number, type, status, customer_id, vehicle_id, appointment_id, related_document_id,
         issue_date, due_date, subtotal_net, tax_rate, tax_amount, total_gross, notes, created_by)
       VALUES (?, 'rechnung', 'offen', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc_number, orig.customer_id, orig.vehicle_id, orig.appointment_id, orig.id,
      new Date().toISOString().slice(0, 10),
      new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      orig.subtotal_net, orig.tax_rate, orig.tax_amount, orig.total_gross,
      orig.notes, req.user?.id || null
    );
    const stmt = db.prepare(
      `INSERT INTO document_items (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    orig.items.forEach((it) =>
      stmt.run(r.lastInsertRowid, it.position, it.service_id, it.description, it.quantity, it.unit, it.unit_price, it.discount_pct, it.line_total_net)
    );
    db.prepare("UPDATE documents SET status = 'angenommen', updated_at = datetime('now') WHERE id = ?").run(orig.id);
    return r.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json(loadFull(id));
});

// ---------- AUS TERMIN ----------
router.post('/from-appointment/:appointmentId', requireRole('admin'), (req, res) => {
  const { type = 'rechnung' } = req.body || {};
  if (!PREFIX[type]) return res.status(400).json({ error: 'Typ ungültig' });

  const a = db.prepare(
    `SELECT a.*, v.id AS vehicle_id
     FROM appointments a
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.id = ?`
  ).get(req.params.appointmentId);
  if (!a) return res.status(404).json({ error: 'Termin nicht gefunden' });

  const svcs = db.prepare(
    `SELECT asv.*, s.name
     FROM appointment_services asv
     JOIN services s ON s.id = asv.service_id
     WHERE asv.appointment_id = ?`
  ).all(req.params.appointmentId);

  const parts = db.prepare('SELECT * FROM appointment_parts WHERE appointment_id = ?').all(req.params.appointmentId);
  const laborRows = db.prepare(
    `SELECT started_at, ended_at FROM appointment_labor_logs
      WHERE appointment_id = ? AND ended_at IS NOT NULL`
  ).all(req.params.appointmentId);
  let laborMinutes = 0;
  for (const L of laborRows) {
    laborMinutes += Math.max(0, Math.round((new Date(L.ended_at) - new Date(L.started_at)) / 60000));
  }

  if (svcs.length === 0 && parts.length === 0 && laborMinutes === 0) {
    return res.status(400).json({ error: 'Keine Leistungen, Teile oder erfasste Arbeitszeit im Termin' });
  }

  const items = [];
  for (const s of svcs) {
    items.push({
      service_id: s.service_id,
      description: s.name,
      quantity: s.quantity,
      unit: 'Stk.',
      unit_price: s.price,
      discount_pct: 0,
    });
  }
  for (const p of parts) {
    items.push({
      service_id: null,
      description: p.part_number ? `${p.part_number} – ${p.description}` : p.description,
      quantity: p.quantity,
      unit: 'Stk.',
      unit_price: p.unit_price,
      discount_pct: 0,
    });
  }
  if (laborMinutes > 0) {
    const rate = Number(getSetting('default_labor_rate_net') || 0);
    if (rate > 0) {
      const hours = laborMinutes / 60;
      items.push({
        service_id: null,
        description: `Arbeitszeit (${laborMinutes} Min. laut Stempelung)`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'h',
        unit_price: rate,
        discount_pct: 0,
      });
    } else {
      items.push({
        service_id: null,
        description: `Arbeitszeit erfasst: ${laborMinutes} Min. (kein Stundensatz in Einstellungen – Position mit 0 €)`,
        quantity: 1,
        unit: 'Pausch.',
        unit_price: 0,
        discount_pct: 0,
      });
    }
  }

  const { items: normItems, subtotal_net, tax_amount, total_gross } = calcTotals(items, 19);

  const tx = db.transaction(() => {
    const doc_number = nextDocNumber(type);
    const r = db.prepare(
      `INSERT INTO documents
        (doc_number, type, status, customer_id, vehicle_id, appointment_id,
         issue_date, due_date, subtotal_net, tax_rate, tax_amount, total_gross, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 19, ?, ?, ?)`
    ).run(
      doc_number,
      type,
      type === 'rechnung' ? 'offen' : 'entwurf',
      a.customer_id, a.vehicle_id, a.id,
      new Date().toISOString().slice(0, 10),
      type === 'rechnung' ? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) : null,
      subtotal_net, tax_amount, total_gross,
      req.user?.id || null
    );
    const stmt = db.prepare(
      `INSERT INTO document_items (document_id, position, service_id, description, quantity, unit, unit_price, discount_pct, line_total_net)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    normItems.forEach((it) =>
      stmt.run(r.lastInsertRowid, it.position, it.service_id, it.description, it.quantity, it.unit, it.unit_price, it.discount_pct, it.line_total_net)
    );
    return r.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json(loadFull(id));
});

// ====================== Druckansicht (HTML) ======================
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function fmt(n) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}

function renderDocumentHtml(d) {
  const workshopName = process.env.WORKSHOP_NAME || 'Fast Cars Autohaus';
  const workshopAddr = process.env.WORKSHOP_ADDRESS || '';
  const workshopPhone = process.env.WORKSHOP_PHONE || '';
  const workshopEmail = process.env.WORKSHOP_EMAIL || '';

  const title = { angebot: 'Angebot', rechnung: 'Rechnung', storno: 'Stornorechnung', gutschrift: 'Gutschrift' }[d.type] || 'Dokument';

  const itemsRows = d.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.description)}</td>
      <td class="num">${fmt(it.quantity)} ${esc(it.unit)}</td>
      <td class="num">${fmt(it.unit_price)} €</td>
      <td class="num">${it.discount_pct ? fmt(it.discount_pct) + ' %' : ''}</td>
      <td class="num">${fmt(it.line_total_net)} €</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${esc(title)} ${esc(d.doc_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; padding: 32px; max-width: 820px; margin: auto; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .sender { font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 16px; }
  .recipient { font-size: 14px; line-height: 1.5; }
  .doc-info { text-align: right; font-size: 13px; }
  .doc-info div { margin: 2px 0; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge-offen { background:#fef3c7; color:#92400e; }
  .badge-bezahlt { background:#d1fae5; color:#065f46; }
  .badge-storniert { background:#fee2e2; color:#991b1b; }
  .badge-entwurf { background:#e2e8f0; color:#475569; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; margin-left: auto; width: 320px; font-size: 14px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals .sum { font-weight: 700; font-size: 17px; border-top: 2px solid #0f172a; padding-top: 10px; }
  .notes { margin-top: 32px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 13px; }
  .footer { margin-top: 48px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  .actions { position: fixed; top: 12px; right: 12px; }
  .actions button { padding: 8px 12px; font-size: 13px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer; }
  @media print { .actions { display: none; } body { padding: 16px; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Drucken</button></div>

  <div class="sender">
    <strong>${esc(workshopName)}</strong> · ${esc(workshopAddr)} · Tel. ${esc(workshopPhone)} · ${esc(workshopEmail)}
  </div>

  <div class="meta">
    <div class="recipient">
      <strong>${esc(d.first_name || '')} ${esc(d.last_name || '')}</strong><br/>
      ${esc(d.address || '')}<br/>
      ${d.email ? esc(d.email) + '<br/>' : ''}
      ${d.phone ? 'Tel. ' + esc(d.phone) : ''}
    </div>
    <div class="doc-info">
      <h1>${esc(title)}</h1>
      <div><strong>${esc(d.doc_number)}</strong></div>
      <div>Datum: ${esc(d.issue_date || '')}</div>
      ${d.due_date ? `<div>Fällig: ${esc(d.due_date)}</div>` : ''}
      <div><span class="badge badge-${esc(d.status)}">${esc(d.status)}</span></div>
    </div>
  </div>

  ${d.license_plate ? `<div style="font-size:13px; margin-bottom:8px; color:#475569;">
    Fahrzeug: <strong>${esc(d.brand || '')} ${esc(d.model || '')}</strong> · ${esc(d.license_plate)}${d.vin ? ' · FIN ' + esc(d.vin) : ''}
  </div>` : ''}

  <table>
    <thead>
      <tr>
        <th style="width:32px;">#</th>
        <th>Beschreibung</th>
        <th class="num">Menge</th>
        <th class="num">Einzelpreis</th>
        <th class="num">Rabatt</th>
        <th class="num">Summe netto</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Netto:</td><td class="num">${fmt(d.subtotal_net)} €</td></tr>
    <tr><td>MwSt. ${fmt(d.tax_rate)} %:</td><td class="num">${fmt(d.tax_amount)} €</td></tr>
    <tr class="sum"><td>Gesamtbetrag:</td><td class="num">${fmt(d.total_gross)} €</td></tr>
    ${d.paid_amount ? `<tr><td>davon bezahlt:</td><td class="num">${fmt(d.paid_amount)} €</td></tr>` : ''}
  </table>

  ${d.notes ? `<div class="notes">${esc(d.notes).replace(/\n/g, '<br/>')}</div>` : ''}

  <div class="footer">
    ${d.type === 'rechnung' ? `Bitte überweisen Sie den offenen Betrag${d.due_date ? ' bis zum ' + esc(d.due_date) : ''} unter Angabe der Rechnungsnummer <strong>${esc(d.doc_number)}</strong>.<br/>` : ''}
    ${d.type === 'angebot' ? 'Dieses Angebot ist 30 Tage gültig.<br/>' : ''}
    ${esc(workshopName)} · ${esc(workshopAddr)}
  </div>
</body>
</html>`;
}

export default router;
