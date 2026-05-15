import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/hours', (_req, res) => {
  const rows = db.prepare('SELECT * FROM workshop_hours ORDER BY weekday').all();
  res.json(rows);
});

router.put('/hours', requireRole('admin'), (req, res) => {
  const hours = req.body?.hours;
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours[] erforderlich' });

  const upsert = db.prepare(
    `INSERT INTO workshop_hours (weekday, open_time, close_time, closed)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(weekday) DO UPDATE SET
       open_time = excluded.open_time,
       close_time = excluded.close_time,
       closed = excluded.closed`
  );
  const tx = db.transaction(() => {
    for (const h of hours) {
      if (typeof h.weekday !== 'number' || h.weekday < 0 || h.weekday > 6) continue;
      upsert.run(
        h.weekday,
        h.closed ? null : (h.open_time || null),
        h.closed ? null : (h.close_time || null),
        h.closed ? 1 : 0
      );
    }
  });
  tx();
  res.json(db.prepare('SELECT * FROM workshop_hours ORDER BY weekday').all());
});

router.get('/closures', (_req, res) => {
  res.json(db.prepare('SELECT * FROM workshop_closures ORDER BY date').all());
});

router.post('/closures', requireRole('admin'), (req, res) => {
  const { date, reason } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date ist erforderlich' });
  try {
    db.prepare('INSERT INTO workshop_closures (date, reason) VALUES (?, ?)')
      .run(date, reason || null);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Datum ist bereits als Schließung hinterlegt' });
    }
    throw err;
  }
  res.status(201).json(db.prepare('SELECT * FROM workshop_closures WHERE date = ?').get(date));
});

router.delete('/closures/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM workshop_closures WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
