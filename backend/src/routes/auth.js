import { Router } from 'express';
import db from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
  }
  const user = db
    .prepare('SELECT * FROM users WHERE email = ? AND active = 1')
    .get(email.toLowerCase().trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }
  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, email, full_name, role, phone, active FROM users WHERE id = ?')
    .get(req.user.id);
  res.json(user);
});

router.post('/register', requireAuth, requireRole('admin'), (req, res) => {
  const { email, password, full_name, role = 'mitarbeiter', phone } = req.body || {};
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'E-Mail, Passwort und Name sind erforderlich' });
  }
  if (!['admin', 'mitarbeiter'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rolle' });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role, phone)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(email.toLowerCase().trim(), hashPassword(password), full_name, role, phone || null);
    const user = db
      .prepare('SELECT id, email, full_name, role, phone, active FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'E-Mail ist bereits vergeben' });
    }
    throw err;
  }
});

export default router;
