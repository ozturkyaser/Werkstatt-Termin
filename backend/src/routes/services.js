import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function normalize(row) {
  if (!row) return row;
  return {
    ...row,
    required_skills: row.required_skills ? JSON.parse(row.required_skills) : [],
  };
}

router.get('/', (req, res) => {
  const { active } = req.query;
  const rows = active === 'all'
    ? db.prepare('SELECT * FROM services ORDER BY category, name').all()
    : db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY category, name').all();
  res.json(rows.map(normalize));
});

router.post('/', requireRole('admin'), (req, res) => {
  const {
    name, description, category, duration_minutes = 60, price = 0, active = 1,
    buffer_minutes = 0, required_bay_type = null, required_skills = [],
    online_bookable = 1,
    internal_code = null, duration_min_minutes = null, duration_max_minutes = null,
    buffer_before_minutes = 0, buffer_after_minutes = 0, complexity = 2,
    color = null, notes = null,
  } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name ist erforderlich' });
  const info = db.prepare(
    `INSERT INTO services
       (name, description, category, duration_minutes, price, active,
        buffer_minutes, required_bay_type, required_skills, online_bookable,
        internal_code, duration_min_minutes, duration_max_minutes,
        buffer_before_minutes, buffer_after_minutes, complexity, color, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, description || null, category || null, duration_minutes, price, active ? 1 : 0,
    buffer_minutes, required_bay_type || null,
    JSON.stringify(Array.isArray(required_skills) ? required_skills : []),
    online_bookable ? 1 : 0,
    internal_code || null, duration_min_minutes, duration_max_minutes,
    buffer_before_minutes || 0, buffer_after_minutes || 0, complexity || 2,
    color || null, notes || null
  );
  res.status(201).json(normalize(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Dienstleistung nicht gefunden' });
  const {
    name, description, category, duration_minutes, price, active,
    buffer_minutes, required_bay_type, required_skills, online_bookable,
    internal_code, duration_min_minutes, duration_max_minutes,
    buffer_before_minutes, buffer_after_minutes, complexity, color, notes,
  } = req.body || {};
  db.prepare(
    `UPDATE services SET name=?, description=?, category=?,
      duration_minutes=?, price=?, active=?,
      buffer_minutes=?, required_bay_type=?, required_skills=?, online_bookable=?,
      internal_code=?, duration_min_minutes=?, duration_max_minutes=?,
      buffer_before_minutes=?, buffer_after_minutes=?, complexity=?, color=?, notes=?
     WHERE id=?`
  ).run(
    name ?? s.name,
    description ?? s.description,
    category ?? s.category,
    duration_minutes ?? s.duration_minutes,
    price ?? s.price,
    active === undefined ? s.active : (active ? 1 : 0),
    buffer_minutes ?? s.buffer_minutes,
    required_bay_type === undefined ? s.required_bay_type : (required_bay_type || null),
    required_skills === undefined ? s.required_skills : JSON.stringify(Array.isArray(required_skills) ? required_skills : []),
    online_bookable === undefined ? s.online_bookable : (online_bookable ? 1 : 0),
    internal_code === undefined ? s.internal_code : (internal_code || null),
    duration_min_minutes === undefined ? s.duration_min_minutes : duration_min_minutes,
    duration_max_minutes === undefined ? s.duration_max_minutes : duration_max_minutes,
    buffer_before_minutes === undefined ? s.buffer_before_minutes : (buffer_before_minutes || 0),
    buffer_after_minutes === undefined ? s.buffer_after_minutes : (buffer_after_minutes || 0),
    complexity === undefined ? s.complexity : (complexity || 2),
    color === undefined ? s.color : (color || null),
    notes === undefined ? s.notes : (notes || null),
    req.params.id
  );
  res.json(normalize(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ====================== CSV EXPORT ======================

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get('/export/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY category, name').all();
  const headers = [
    'name',
    'description',
    'category',
    'duration_minutes',
    'price',
    'buffer_minutes',
    'required_bay_type',
    'required_skills',
    'online_bookable',
    'active',
  ];
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.description,
        r.category,
        r.duration_minutes,
        r.price,
        r.buffer_minutes,
        r.required_bay_type,
        r.required_skills, // bereits JSON-String
        r.online_bookable,
        r.active,
      ]
        .map(csvEscape)
        .join(';')
    );
  }
  const csv = '\ufeff' + lines.join('\n'); // BOM für Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dienstleistungen-${Date.now()}.csv"`);
  res.send(csv);
});

// ====================== CSV IMPORT ======================
// Ablauf: Frontend parst CSV selbst (Feld-Mapping) und schickt Liste von Objekten.
//         Optional mit mode: 'create_only' | 'upsert' (default upsert – per name matchen)

router.post('/import', requireRole('admin'), (req, res) => {
  const { rows = [], mode = 'upsert' } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Keine Zeilen zum Importieren' });
  }

  const stmtInsert = db.prepare(
    `INSERT INTO services
       (name, description, category, duration_minutes, price, active,
        buffer_minutes, required_bay_type, required_skills, online_bookable,
        internal_code, duration_min_minutes, duration_max_minutes,
        buffer_before_minutes, buffer_after_minutes, complexity, color, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const stmtUpdate = db.prepare(
    `UPDATE services
        SET description=?, category=?, duration_minutes=?, price=?, active=?,
            buffer_minutes=?, required_bay_type=?, required_skills=?, online_bookable=?,
            internal_code=?, duration_min_minutes=?, duration_max_minutes=?,
            buffer_before_minutes=?, buffer_after_minutes=?, complexity=?, color=?, notes=?
      WHERE id = ?`
  );
  const findByCode = db.prepare('SELECT id FROM services WHERE internal_code = ? AND internal_code IS NOT NULL');
  const findByName = db.prepare('SELECT id FROM services WHERE lower(name) = lower(?)');

  const errors = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const tx = db.transaction((items) => {
    items.forEach((raw, i) => {
      try {
        const name = (raw.name || '').toString().trim();
        if (!name) {
          errors.push({ row: i + 1, error: 'Name fehlt' });
          skipped++;
          return;
        }
        const parsedSkills = (() => {
          if (!raw.required_skills) return [];
          if (Array.isArray(raw.required_skills)) return raw.required_skills;
          const s = String(raw.required_skills).trim();
          if (!s) return [];
          if (s.startsWith('[')) {
            try { return JSON.parse(s); } catch { /* noop */ }
          }
          return s.split(/[,\|]/).map((x) => x.trim()).filter(Boolean);
        })();

        const bMin = parseInt(raw.duration_min_minutes, 10);
        const bMax = parseInt(raw.duration_max_minutes, 10);
        const bBefore = parseInt(raw.buffer_before_minutes || 0, 10) || 0;
        const bAfter = parseInt(raw.buffer_after_minutes || 0, 10) || 0;
        const dMain =
          parseInt(raw.duration_minutes, 10) ||
          (Number.isFinite(bMax) ? bMax : 60);

        const values = [
          raw.description || null,
          raw.category || null,
          dMain,
          parseFloat(String(raw.price ?? 0).replace(',', '.')) || 0,
          raw.active === undefined ? 1 : (isTrue(raw.active) ? 1 : 0),
          parseInt(raw.buffer_minutes || bBefore + bAfter, 10) || 0,
          raw.required_bay_type || null,
          JSON.stringify(parsedSkills),
          raw.online_bookable === undefined ? 1 : (isTrue(raw.online_bookable) ? 1 : 0),
          raw.internal_code || null,
          Number.isFinite(bMin) ? bMin : null,
          Number.isFinite(bMax) ? bMax : null,
          bBefore,
          bAfter,
          parseInt(raw.complexity || 2, 10) || 2,
          raw.color || null,
          raw.notes || null,
        ];

        const existing = (raw.internal_code && findByCode.get(raw.internal_code)) || findByName.get(name);
        if (existing && mode === 'upsert') {
          stmtUpdate.run(...values, existing.id);
          updated++;
        } else if (existing && mode === 'create_only') {
          skipped++;
        } else {
          stmtInsert.run(name, ...values);
          created++;
        }
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
        skipped++;
      }
    });
  });

  tx(rows);

  res.json({
    total: rows.length,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 50),
  });
});

function isTrue(v) {
  if (v === true || v === 1) return true;
  const s = String(v).toLowerCase().trim();
  return ['1', 'true', 'ja', 'yes', 'y', 'wahr', 'on'].includes(s);
}

export default router;
