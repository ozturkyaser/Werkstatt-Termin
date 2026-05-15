import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { findAvailability } from '../services/availability.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { date, duration_minutes, appointment_id } = req.query;
  if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) erforderlich' });
  const serviceIds = (req.query.service_ids || '')
    .toString().split(',').filter(Boolean).map((x) => Number(x));

  const result = findAvailability({
    date: String(date),
    service_ids: serviceIds,
    duration_min: duration_minutes ? Number(duration_minutes) : undefined,
    appointmentId: appointment_id ? Number(appointment_id) : null,
  });
  res.json(result);
});

export default router;
