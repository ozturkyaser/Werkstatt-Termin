import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ---------- Arbeitszeiten ----------

router.get('/:id/schedule', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM employee_schedules WHERE employee_id = ? ORDER BY weekday'
  ).all(req.params.id);
  res.json(rows);
});

router.put('/:id/schedule', requireRole('admin'), (req, res) => {
  const { schedule } = req.body || {};
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'schedule[] erforderlich' });

  const del = db.prepare('DELETE FROM employee_schedules WHERE employee_id = ? AND weekday = ?');
  const ins = db.prepare(
    `INSERT INTO employee_schedules
     (employee_id, weekday, start_time, end_time, break_start, break_end)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const s of schedule) {
      if (typeof s.weekday !== 'number' || s.weekday < 0 || s.weekday > 6) continue;
      del.run(req.params.id, s.weekday);
      if (!s.removed && s.start_time && s.end_time) {
        ins.run(req.params.id, s.weekday, s.start_time, s.end_time,
          s.break_start || null, s.break_end || null);
      }
    }
  });
  tx();
  res.json(db.prepare('SELECT * FROM employee_schedules WHERE employee_id = ? ORDER BY weekday')
    .all(req.params.id));
});

// ---------- Abwesenheiten ----------

router.get('/:id/absences', (req, res) => {
  res.json(db.prepare(
    'SELECT * FROM employee_absences WHERE employee_id = ? ORDER BY from_date DESC'
  ).all(req.params.id));
});

router.post('/:id/absences', requireRole('admin'), (req, res) => {
  const { from_date, to_date, type = 'urlaub', reason } = req.body || {};
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date/to_date erforderlich' });
  const info = db.prepare(
    `INSERT INTO employee_absences (employee_id, from_date, to_date, type, reason)
     VALUES (?, ?, ?, ?, ?)`
  ).run(req.params.id, from_date, to_date, type, reason || null);
  res.status(201).json(db.prepare('SELECT * FROM employee_absences WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id/absences/:absId', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM employee_absences WHERE id = ? AND employee_id = ?')
    .run(req.params.absId, req.params.id);
  res.json({ success: true });
});

// ---------- Skills ----------

router.get('/:id/skills', (req, res) => {
  res.json(db.prepare('SELECT skill FROM employee_skills WHERE employee_id = ?')
    .all(req.params.id).map((r) => r.skill));
});

router.put('/:id/skills', requireRole('admin'), (req, res) => {
  const { skills } = req.body || {};
  if (!Array.isArray(skills)) return res.status(400).json({ error: 'skills[] erforderlich' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM employee_skills WHERE employee_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO employee_skills (employee_id, skill) VALUES (?, ?)');
    for (const s of skills) {
      if (typeof s === 'string' && s.trim()) ins.run(req.params.id, s.trim().toLowerCase());
    }
  });
  tx();
  res.json(db.prepare('SELECT skill FROM employee_skills WHERE employee_id = ?')
    .all(req.params.id).map((r) => r.skill));
});

export default router;
