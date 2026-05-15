import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const entityType = req.query.entity_type;
  const entityId = req.query.entity_id;

  const where = [];
  const params = [];
  if (entityType) {
    where.push('a.entity_type = ?');
    params.push(entityType);
  }
  if (entityId) {
    where.push('a.entity_id = ?');
    params.push(Number(entityId));
  }
  const sql = `SELECT a.*, u.email AS user_email, u.full_name AS user_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset);
  const parsed = rows.map((r) => ({
    ...r,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    payload_json: undefined,
  }));
  res.json(parsed);
});

export default router;
