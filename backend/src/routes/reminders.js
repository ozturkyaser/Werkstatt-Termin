import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { processPendingReminders, scheduleRemindersForAppointment, cancelRemindersForAppointment }
  from '../services/reminders.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { appointment_id, status } = req.query;
  const where = [];
  const params = [];
  if (appointment_id) { where.push('r.appointment_id = ?'); params.push(appointment_id); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  const rows = db.prepare(
    `SELECT r.*, a.start_time, c.first_name, c.last_name
     FROM reminders r
     JOIN appointments a ON a.id = r.appointment_id
     JOIN customers c ON c.id = a.customer_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY r.scheduled_at DESC LIMIT 200`
  ).all(...params);
  res.json(rows);
});

router.post('/appointment/:id', (req, res) => {
  const { channels } = req.body || {};
  if (!Array.isArray(channels) || !channels.length) {
    return res.status(400).json({ error: 'channels[] erforderlich' });
  }
  cancelRemindersForAppointment(req.params.id);
  const ids = scheduleRemindersForAppointment(req.params.id, channels);
  res.json({ created: ids });
});

router.post('/run-now', async (_req, res) => {
  const count = await processPendingReminders();
  res.json({ processed: count });
});

export default router;
