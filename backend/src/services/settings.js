import db from '../db.js';

const SECRET_KEYS = new Set(['ai_api_key', 'phone_ai_webhook_secret']);

const DEFAULTS = {
  ai_provider: 'openai',
  ai_model: 'gpt-4o-mini',
  ai_api_key: '',
  ai_language: 'de',

  // Online-Buchung
  booking_mode: 'smart',          // 'auto' | 'pending' | 'smart'
  booking_min_lead_hours: '2',    // Mindestvorlauf in Stunden für Online-Buchungen
  booking_max_days_ahead: '60',   // Wie weit kann man in die Zukunft buchen

  // Telefon-KI (z.B. Synthflow / Retell / Vapi)
  phone_ai_provider: 'synthflow',
  phone_ai_enabled: 'false',
  phone_ai_webhook_secret: '',    // Shared Secret für Inbound-Webhook

  // DATEV-Export
  datev_beraternummer: '',        // DATEV-Beraternummer (vom Steuerberater)
  datev_mandantennummer: '',      // DATEV-Mandantennummer
  datev_kontenrahmen: 'skr03',    // 'skr03' | 'skr04'
  datev_bezeichnung: 'Werkstatt-Export',
  datev_encoding: 'cp1252',       // 'cp1252' (DATEV-Standard) | 'utf8' (Unternehmen online)
  datev_custom_accounts: '',      // JSON mit individuellen Sachkonten (überschreibt Preset)

  // Reifen-Saison-E-Mails (Einlagerung)
  tire_reminder_enabled: 'true',
  tire_mail_winter_month: '10',   // Oktober: Hinweis für Winterräder (wenn Winterset eingelagert)
  tire_mail_summer_month: '3',    // März: Hinweis für Sommerräder (wenn Sommerset eingelagert)
  tire_mail_day_max: '7',         // E-Mails nur an den ersten X Tagen des Monats (Doppelversand vermeiden)
  default_labor_rate_net: '',     // optional €/h für Arbeitszeit-Zeile aus Termin in Rechnung

  // Öffentliche Buchungs-URL für E-Mails (z. B. https://werkstatt.example.com)
  public_booking_base_url: '',
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value !== null) return row.value;
  return DEFAULTS[key] ?? null;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value === null || value === undefined ? null : String(value));
}

export function getAllSettings({ includeSecrets = false } = {}) {
  const result = { ...DEFAULTS };
  const rows = db.prepare('SELECT key, value FROM settings').all();
  for (const r of rows) result[r.key] = r.value;

  if (!includeSecrets) {
    for (const k of SECRET_KEYS) {
      const v = result[k];
      result[k] = v ? `****${String(v).slice(-4)}` : '';
      result[`${k}_set`] = Boolean(v);
    }
  }
  return result;
}

export function isSecret(key) {
  return SECRET_KEYS.has(key);
}
