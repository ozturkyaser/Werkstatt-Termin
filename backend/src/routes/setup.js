import { Router } from 'express';
import fs from 'node:fs';
import { paths } from '../loadRuntimeConfig.js';
import {
  isRuntimeConfigComplete,
  isSetupWizardActive,
  readSetupToken,
  validateSetupToken,
} from '../services/setupWizard.js';
import { resetNotificationClients } from '../services/reminders.js';

const router = Router();

const ALLOWED_KEYS = new Set([
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'FRONTEND_URL',
  'WORKSHOP_NAME',
  'WORKSHOP_ADDRESS',
  'WORKSHOP_PHONE',
  'WORKSHOP_EMAIL',
  'REMINDER_HOURS_BEFORE',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'TWILIO_WHATSAPP_FROM',
]);

export const SETUP_FIELD_SCHEMA = [
  { key: 'JWT_SECRET', label: 'JWT-Secret', type: 'password', required: true, minLength: 16, hint: 'Zufälliger langer Wert für Login-Tokens. Kann generiert werden.' },
  { key: 'JWT_EXPIRES_IN', label: 'JWT gültig', type: 'text', required: false, placeholder: '7d', hint: 'z. B. 7d oder 24h' },
  { key: 'FRONTEND_URL', label: 'Öffentliche App-URL', type: 'url', required: true, hint: 'https://termin.ihre-domain.de — ohne Slash am Ende (CORS & Links)' },
  { key: 'WORKSHOP_NAME', label: 'Werkstatt-Name', type: 'text', required: false },
  { key: 'WORKSHOP_ADDRESS', label: 'Adresse', type: 'text', required: false },
  { key: 'WORKSHOP_PHONE', label: 'Telefon', type: 'text', required: false },
  { key: 'WORKSHOP_EMAIL', label: 'E-Mail Werkstatt', type: 'text', required: false },
  { key: 'REMINDER_HOURS_BEFORE', label: 'Erinnerung (Std. vorher)', type: 'number', required: false, placeholder: '24' },
  { key: 'SMTP_HOST', label: 'SMTP Host', type: 'text', required: false },
  { key: 'SMTP_PORT', label: 'SMTP Port', type: 'text', required: false, placeholder: '587' },
  { key: 'SMTP_SECURE', label: 'SMTP TLS (true/false)', type: 'text', required: false, placeholder: 'false' },
  { key: 'SMTP_USER', label: 'SMTP Benutzer', type: 'text', required: false },
  { key: 'SMTP_PASS', label: 'SMTP Passwort', type: 'password', required: false },
  { key: 'SMTP_FROM', label: 'SMTP Absender', type: 'text', required: false, placeholder: '"Name" <mail@domain.de>' },
  { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID', type: 'text', required: false },
  { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', type: 'password', required: false },
  { key: 'TWILIO_FROM_NUMBER', label: 'Twilio SMS Absender', type: 'text', required: false },
  { key: 'TWILIO_WHATSAPP_FROM', label: 'Twilio WhatsApp Absender', type: 'text', required: false, placeholder: 'whatsapp:+14155238886' },
];

/** Öffentlich: ob der Wizard noch offen ist (für Login-Hinweis). */
router.get('/open', (_req, res) => {
  if (fs.existsSync(paths.setupCompletePath)) {
    return res.json({ setupRequired: false });
  }
  if (isRuntimeConfigComplete()) {
    return res.json({ setupRequired: false });
  }
  const hasToken = Boolean(readSetupToken());
  res.json({ setupRequired: hasToken });
});

router.get('/status', (req, res) => {
  const token = (req.query.token || '').trim();
  if (!isSetupWizardActive()) {
    return res.json({ setupRequired: false, needToken: false, message: 'Einrichtung abgeschlossen.' });
  }
  if (!token) {
    return res.json({ setupRequired: true, needToken: true, message: 'Token erforderlich (siehe Server-Log beim Start).' });
  }
  if (!validateSetupToken(token)) {
    return res.status(403).json({ error: 'Ungültiger oder abgelaufener Einrichtungs-Token' });
  }
  res.json({
    setupRequired: true,
    needToken: false,
    fields: SETUP_FIELD_SCHEMA,
  });
});

router.post('/finish', (req, res) => {
  const { token, values } = req.body || {};
  if (!isSetupWizardActive()) {
    return res.status(400).json({ error: 'Einrichtung ist bereits abgeschlossen' });
  }
  if (!validateSetupToken(token)) {
    return res.status(403).json({ error: 'Ungültiger Token' });
  }
  if (!values || typeof values !== 'object') {
    return res.status(400).json({ error: 'values-Objekt erforderlich' });
  }

  let existing = {};
  if (fs.existsSync(paths.runtimePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(paths.runtimePath, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const out = { ...existing };
  for (const [k, v] of Object.entries(values)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === '') continue;
    out[k] = s;
  }

  if (!out.JWT_SECRET || String(out.JWT_SECRET).length < 16) {
    return res.status(400).json({ error: 'JWT_SECRET muss mindestens 16 Zeichen haben' });
  }
  if (!out.FRONTEND_URL || !/^https?:\/\/.+/i.test(out.FRONTEND_URL)) {
    return res.status(400).json({ error: 'FRONTEND_URL muss eine gültige http(s)-URL sein' });
  }

  if (!out.JWT_EXPIRES_IN) out.JWT_EXPIRES_IN = '7d';
  if (!out.REMINDER_HOURS_BEFORE) out.REMINDER_HOURS_BEFORE = '24';
  if (!out.SMTP_PORT) out.SMTP_PORT = '587';
  if (!out.SMTP_SECURE) out.SMTP_SECURE = 'false';
  if (!out.TWILIO_WHATSAPP_FROM) out.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';

  fs.writeFileSync(paths.runtimePath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  for (const [k, v] of Object.entries(out)) {
    process.env[k] = String(v);
  }

  try {
    if (fs.existsSync(paths.setupTokenPath)) fs.unlinkSync(paths.setupTokenPath);
  } catch {
    /* ignore */
  }
  fs.writeFileSync(paths.setupCompletePath, new Date().toISOString(), 'utf8');

  resetNotificationClients();

  return res.json({
    ok: true,
    message:
      'Konfiguration gespeichert. Anmeldung sollte sofort funktionieren. Für maximale Sicherheit aller Dienste: docker compose restart backend',
  });
});

export default router;
