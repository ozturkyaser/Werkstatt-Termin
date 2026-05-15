import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ---------- KATEGORIEN ----------
router.get('/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM expense_categories ORDER BY name').all());
});

router.post('/categories', requireRole('admin'), (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  try {
    const r = db.prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)').run(name, color || '#64748b');
    res.status(201).json({ id: r.lastInsertRowid, name, color });
  } catch (e) {
    res.status(400).json({ error: 'Kategorie existiert bereits' });
  }
});

router.delete('/categories/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------- LIST ----------
router.get('/', (req, res) => {
  const { from, to, category_id, q } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('e.expense_date >= ?'); params.push(from); }
  if (to) { where.push('e.expense_date <= ?'); params.push(to); }
  if (category_id) { where.push('e.category_id = ?'); params.push(category_id); }
  if (q) {
    where.push('(e.description LIKE ? OR e.vendor LIKE ? OR e.invoice_number LIKE ?)');
    const p = `%${q}%`;
    params.push(p, p, p);
  }
  const sql = `
    SELECT e.*, c.name AS category_name, c.color AS category_color
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.expense_date DESC, e.id DESC
  `;
  res.json(db.prepare(sql).all(...params));
});

// ---------- STATS (Monatsübersicht Einnahmen/Ausgaben) ----------
router.get('/stats/overview', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const expenseMonths = db.prepare(
    `SELECT strftime('%Y-%m', expense_date) AS month,
            SUM(amount_net) AS net, SUM(tax_amount) AS tax, SUM(amount_gross) AS gross
     FROM expenses
     WHERE strftime('%Y', expense_date) = ?
     GROUP BY month
     ORDER BY month`
  ).all(String(year));

  const incomeMonths = db.prepare(
    `SELECT strftime('%Y-%m', issue_date) AS month,
            SUM(subtotal_net) AS net, SUM(tax_amount) AS tax, SUM(total_gross) AS gross
     FROM documents
     WHERE type IN ('rechnung','storno','gutschrift')
       AND strftime('%Y', issue_date) = ?
     GROUP BY month
     ORDER BY month`
  ).all(String(year));

  // per-Kategorie
  const byCategory = db.prepare(
    `SELECT c.id, c.name, c.color,
            SUM(e.amount_net) AS net,
            SUM(e.amount_gross) AS gross,
            COUNT(*) AS count
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE strftime('%Y', e.expense_date) = ?
     GROUP BY c.id, c.name, c.color
     ORDER BY net DESC`
  ).all(String(year));

  // offene Rechnungen (aktuell)
  const openInvoices = db.prepare(
    `SELECT COALESCE(SUM(total_gross - paid_amount), 0) AS open_gross, COUNT(*) AS open_count
     FROM documents WHERE type='rechnung' AND status IN ('offen','teilweise_bezahlt')`
  ).get();

  // Jahressummen
  const expSum = db.prepare(
    `SELECT COALESCE(SUM(amount_net),0) AS net, COALESCE(SUM(tax_amount),0) AS tax, COALESCE(SUM(amount_gross),0) AS gross
     FROM expenses WHERE strftime('%Y', expense_date) = ?`
  ).get(String(year));
  const incSum = db.prepare(
    `SELECT COALESCE(SUM(subtotal_net),0) AS net, COALESCE(SUM(tax_amount),0) AS tax, COALESCE(SUM(total_gross),0) AS gross
     FROM documents WHERE type IN ('rechnung','storno','gutschrift') AND strftime('%Y', issue_date) = ?`
  ).get(String(year));

  res.json({
    year,
    expense_months: expenseMonths,
    income_months: incomeMonths,
    by_category: byCategory,
    open_invoices: openInvoices,
    totals: {
      income: incSum,
      expenses: expSum,
      profit_net: Math.round((incSum.net - expSum.net) * 100) / 100,
      profit_gross: Math.round((incSum.gross - expSum.gross) * 100) / 100,
    },
  });
});

// ---------- CSV EXPORT ----------
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
router.get('/export/csv', (req, res) => {
  const { year } = req.query;
  const filter = year ? 'WHERE strftime(\'%Y\', expense_date) = ?' : '';
  const params = year ? [String(year)] : [];
  const rows = db.prepare(
    `SELECT e.expense_date, c.name AS category, e.vendor, e.description,
            e.amount_net, e.tax_rate, e.tax_amount, e.amount_gross,
            e.payment_method, e.invoice_number, e.notes
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       ${filter}
       ORDER BY e.expense_date`
  ).all(...params);
  const headers = ['Datum','Kategorie','Lieferant','Beschreibung','Netto','MwSt %','MwSt','Brutto','Zahlart','Rechnungsnr.','Notiz'];
  const out = '\ufeff' + headers.join(';') + '\n' +
    rows.map((r) => [
      r.expense_date, r.category, r.vendor, r.description,
      r.amount_net, r.tax_rate, r.tax_amount, r.amount_gross,
      r.payment_method, r.invoice_number, r.notes,
    ].map(csvEscape).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ausgaben-${year || 'alle'}.csv"`);
  res.send(out);
});

// ---------- GET ----------
router.get('/:id', (req, res) => {
  const r = db.prepare(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.id = ?`
  ).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(r);
});

// ---------- CREATE ----------
router.post('/', requireRole('admin'), (req, res) => {
  const {
    expense_date, category_id, vendor, description,
    amount_net = 0, tax_rate = 19, amount_gross,
    payment_method = 'ueberweisung', invoice_number, notes,
  } = req.body || {};
  if (!expense_date || !description) return res.status(400).json({ error: 'Datum und Beschreibung sind Pflicht' });

  let net = Number(amount_net) || 0;
  let rate = Number(tax_rate) || 0;
  let gross = amount_gross !== undefined ? Number(amount_gross) : null;
  if (gross === null) {
    gross = Math.round(net * (1 + rate / 100) * 100) / 100;
  } else if (!net) {
    net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  }
  const tax = Math.round((gross - net) * 100) / 100;

  const r = db.prepare(
    `INSERT INTO expenses (expense_date, category_id, vendor, description,
       amount_net, tax_rate, tax_amount, amount_gross, payment_method, invoice_number, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    expense_date, category_id || null, vendor || null, description,
    net, rate, tax, gross, payment_method, invoice_number || null, notes || null,
    req.user?.id || null
  );
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(r.lastInsertRowid));
});

// ---------- UPDATE ----------
router.put('/:id', requireRole('admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Nicht gefunden' });
  const b = req.body || {};
  const net = b.amount_net !== undefined ? Number(b.amount_net) : e.amount_net;
  const rate = b.tax_rate !== undefined ? Number(b.tax_rate) : e.tax_rate;
  const gross = b.amount_gross !== undefined
    ? Number(b.amount_gross)
    : Math.round(net * (1 + rate / 100) * 100) / 100;
  const tax = Math.round((gross - net) * 100) / 100;

  db.prepare(
    `UPDATE expenses SET expense_date=?, category_id=?, vendor=?, description=?,
        amount_net=?, tax_rate=?, tax_amount=?, amount_gross=?, payment_method=?, invoice_number=?, notes=?
      WHERE id = ?`
  ).run(
    b.expense_date ?? e.expense_date,
    b.category_id !== undefined ? (b.category_id || null) : e.category_id,
    b.vendor ?? e.vendor,
    b.description ?? e.description,
    net, rate, tax, gross,
    b.payment_method ?? e.payment_method,
    b.invoice_number ?? e.invoice_number,
    b.notes ?? e.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
});

// ---------- DELETE ----------
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
