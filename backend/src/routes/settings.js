import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAllSettings, setSetting, isSecret } from '../services/settings.js';

const router = Router();
router.use(requireAuth);

const ALLOWED = [
  'ai_provider', 'ai_model', 'ai_api_key', 'ai_language',
  'booking_mode', 'booking_min_lead_hours', 'booking_max_days_ahead',
  'phone_ai_provider', 'phone_ai_enabled', 'phone_ai_webhook_secret',
  'tire_reminder_enabled', 'tire_mail_winter_month', 'tire_mail_summer_month', 'tire_mail_day_max',
  'default_labor_rate_net', 'public_booking_base_url',
];

router.get('/', (_req, res) => {
  res.json(getAllSettings());
});

router.put('/', requireRole('admin'), (req, res) => {
  const updates = req.body || {};
  for (const [k, v] of Object.entries(updates)) {
    if (!ALLOWED.includes(k)) continue;
    // Leere Platzhalter für Secret ignorieren (damit man das Feld leer lassen kann)
    if (isSecret(k) && (v === '' || v === null || v === undefined || String(v).startsWith('****'))) continue;
    setSetting(k, v);
  }
  res.json(getAllSettings());
});

export default router;
