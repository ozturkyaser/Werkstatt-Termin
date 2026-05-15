import { Router } from 'express';
import db from '../db.js';
import { hashPassword } from '../auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, email, full_name, role, phone, active, created_at FROM users ORDER BY full_name')
    .all();
  res.json(rows);
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
  const { full_name, role, phone, active, password } = req.body || {};
  db.prepare(
    `UPDATE users SET full_name=?, role=?, phone=?, active=?${password ? ', password_hash=?' : ''}
     WHERE id=?`
  ).run(
    ...[
      full_name ?? u.full_name,
      role ?? u.role,
      phone ?? u.phone,
      active === undefined ? u.active : (active ? 1 : 0),
      ...(password ? [hashPassword(password)] : []),
      req.params.id,
    ]
  );
  const out = db
    .prepare('SELECT id, email, full_name, role, phone, active FROM users WHERE id = ?')
    .get(req.params.id);
  res.json(out);
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Eigenes Konto kann nicht deaktiviert werden' });
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
