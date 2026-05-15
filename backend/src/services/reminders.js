import dayjs from 'dayjs';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import db from '../db.js';
import { getSetting } from './settings.js';

dotenv.config();

function hoursBefore() {
  return Number(process.env.REMINDER_HOURS_BEFORE || 24);
}
function workshopName() {
  return process.env.WORKSHOP_NAME || 'Fast Cars Autohaus';
}
function workshopAddress() {
  return process.env.WORKSHOP_ADDRESS || 'Wittestr. 26A, 13509 Berlin-Wittenau';
}
function workshopPhone() {
  return process.env.WORKSHOP_PHONE || '030 40244 15';
}

/** Nach Änderung der SMTP-/Twilio-Umgebung (z. B. Setup-Wizard ohne Container-Neustart). */
export function resetNotificationClients() {
  mailer = null;
  twilioClient = null;
}

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.SMTP_HOST) return null;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return mailer;
}

let twilioClient = null;
async function getTwilio() {
  if (twilioClient !== null) return twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = false;
    return null;
  }
  try {
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return twilioClient;
  } catch {
    twilioClient = false;
    return null;
  }
}

function buildMessage(appointment) {
  const dt = dayjs(appointment.start_time);
  return `Hallo ${appointment.first_name} ${appointment.last_name},

dies ist eine Erinnerung an Ihren Werkstatttermin bei ${workshopName()}:

• Datum: ${dt.format('DD.MM.YYYY')}
• Uhrzeit: ${dt.format('HH:mm')} Uhr
• Fahrzeug: ${appointment.brand || ''} ${appointment.model || ''} (${appointment.license_plate})
${appointment.services ? `• Leistungen: ${appointment.services}\n` : ''}
Bitte bringen Sie Ihren Fahrzeugschein mit.
Sollten Sie verhindert sein, rufen Sie uns bitte rechtzeitig an: ${workshopPhone()}.

Adresse: ${workshopAddress()}

Mit freundlichen Grüßen
${workshopName()}`;
}

function loadAppointmentForReminder(id) {
  const a = db
    .prepare(
      `SELECT a.*,
              c.first_name, c.last_name, c.email AS customer_email,
              c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
              v.license_plate, v.brand, v.model
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       WHERE a.id = ?`
    )
    .get(id);
  if (!a) return null;
  a.services = db
    .prepare(
      `SELECT s.name FROM appointment_services asv
       JOIN services s ON s.id = asv.service_id WHERE asv.appointment_id = ?`
    )
    .all(id)
    .map((r) => r.name)
    .join(', ');
  return a;
}

export function scheduleRemindersForAppointment(appointmentId, channels = []) {
  if (!channels.length) return [];
  const appointment = loadAppointmentForReminder(appointmentId);
  if (!appointment) return [];
  const scheduledAt = dayjs(appointment.start_time).subtract(hoursBefore(), 'hour').toISOString();
  const insert = db.prepare(
    `INSERT INTO reminders (appointment_id, channel, scheduled_at, recipient, message, status)
     VALUES (?, ?, ?, ?, ?, 'geplant')`
  );
  const msg = buildMessage(appointment);
  const created = [];
  for (const ch of channels) {
    if (!['email', 'sms', 'whatsapp', 'internal'].includes(ch)) continue;
    const recipient =
      ch === 'email' ? appointment.customer_email
      : ch === 'sms' ? appointment.customer_phone
      : ch === 'whatsapp' ? (appointment.customer_whatsapp || appointment.customer_phone)
      : null;
    const info = insert.run(appointmentId, ch, scheduledAt, recipient, msg);
    created.push(info.lastInsertRowid);
  }
  return created;
}

export function cancelRemindersForAppointment(appointmentId) {
  db.prepare(
    `UPDATE reminders SET status = 'abgebrochen'
     WHERE appointment_id = ? AND status = 'geplant'`
  ).run(appointmentId);
}

async function sendReminder(reminder, appointment) {
  const message = reminder.message || buildMessage(appointment);
  const recipient = reminder.recipient;

  if (!recipient && reminder.channel !== 'internal') {
    throw new Error(`Keine ${reminder.channel}-Adresse für Kunde vorhanden`);
  }

  if (reminder.channel === 'email') {
    const m = getMailer();
    if (!m) {
      console.log('[Erinnerung:EMAIL (dry-run)]', recipient, '\n', message);
      return;
    }
    await m.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@werkstatt.local',
      to: recipient,
      subject: `Terminerinnerung – ${workshopName()}`,
      text: message,
    });
    return;
  }

  if (reminder.channel === 'sms') {
    const t = await getTwilio();
    if (!t || !process.env.TWILIO_FROM_NUMBER) {
      console.log('[Erinnerung:SMS (dry-run)]', recipient, '\n', message);
      return;
    }
    await t.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to: recipient,
      body: message,
    });
    return;
  }

  if (reminder.channel === 'whatsapp') {
    const t = await getTwilio();
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!t || !from) {
      console.log('[Erinnerung:WHATSAPP (dry-run)]', recipient, '\n', message);
      return;
    }
    const to = recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`;
    await t.messages.create({ from, to, body: message });
    return;
  }

  if (reminder.channel === 'internal') {
    console.log('[Interne Erinnerung] Termin', reminder.appointment_id, '\n', message);
  }
}

export async function processPendingReminders(now = new Date()) {
  const due = db
    .prepare(
      `SELECT r.*, a.status AS appt_status
       FROM reminders r
       JOIN appointments a ON a.id = r.appointment_id
       WHERE r.status = 'geplant' AND r.scheduled_at <= ?`
    )
    .all(now.toISOString());

  for (const r of due) {
    if (['storniert', 'abgeschlossen'].includes(r.appt_status)) {
      db.prepare("UPDATE reminders SET status='abgebrochen' WHERE id = ?").run(r.id);
      continue;
    }
    const appointment = loadAppointmentForReminder(r.appointment_id);
    try {
      await sendReminder(r, appointment);
      db.prepare(
        `UPDATE reminders SET status='gesendet', sent_at=datetime('now'), last_error=NULL
         WHERE id = ?`
      ).run(r.id);
    } catch (err) {
      console.error('Erinnerung fehlgeschlagen:', err.message);
      db.prepare(
        `UPDATE reminders SET status='fehler', last_error=? WHERE id = ?`
      ).run(String(err.message).slice(0, 500), r.id);
    }
  }
  return due.length;
}

function tireBookingLink() {
  const base = String(getSetting('public_booking_base_url') || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  return base ? `${base}/kalender` : '';
}

/** Saisonale Reifen-E-Mails (Einlagerung: Winter-Set → Oktober, Sommer-Set → März) */
export async function processSeasonalTireReminders(now = new Date()) {
  if (String(getSetting('tire_reminder_enabled') || 'true').toLowerCase() === 'false') return 0;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  const maxDay = Number(getSetting('tire_mail_day_max') || 7);
  if (day > maxDay) return 0;

  const winterMonth = Number(getSetting('tire_mail_winter_month') || 10);
  const summerMonth = Number(getSetting('tire_mail_summer_month') || 3);
  const transport = getMailer();
  let sent = 0;

  if (month === winterMonth) {
    const rows = db.prepare(
      `SELECT t.id, t.customer_id, c.email, c.first_name, c.last_name, v.license_plate
         FROM tire_storage t
         JOIN customers c ON c.id = t.customer_id
         JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.active = 1 AND t.lagertyp = 'winter'
          AND c.email IS NOT NULL AND TRIM(c.email) != ''
          AND (t.last_winter_reminder_year IS NULL OR t.last_winter_reminder_year < ?)`
    ).all(year);
    const link = tireBookingLink();
    for (const t of rows) {
      const text = `Guten Tag ${t.first_name} ${t.last_name},

der Winter steht vor der Tür. Für Ihr Fahrzeug (${t.license_plate}) lagert bei uns Ihr Winterkomplettradsatz.

Bitte vereinbaren Sie rechtzeitig einen Termin zum Radwechsel – so sind Sie sicher und pünktlich versorgt.
${link ? `\nDirekt online buchen:\n${link}\n` : ''}
Telefon: ${workshopPhone()}

Mit freundlichen Grüßen
${workshopName()}
${workshopAddress()}`;
      try {
        if (!transport) {
          console.log('[Reifen Winter E-Mail dry-run]', t.email, text.slice(0, 200));
          continue;
        }
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'no-reply@werkstatt.local',
          to: t.email,
          subject: `Winterreifen – jetzt Termin vereinbaren | ${workshopName()}`,
          text,
        });
        db.prepare(
          "UPDATE tire_storage SET last_winter_reminder_year = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(year, t.id);
        sent++;
      } catch (e) {
        console.error('[Reifen Winter E-Mail]', t.id, e.message);
      }
    }
  }

  if (month === summerMonth) {
    const rows = db.prepare(
      `SELECT t.id, t.customer_id, c.email, c.first_name, c.last_name, v.license_plate
         FROM tire_storage t
         JOIN customers c ON c.id = t.customer_id
         JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.active = 1 AND t.lagertyp = 'sommer'
          AND c.email IS NOT NULL AND TRIM(c.email) != ''
          AND (t.last_summer_reminder_year IS NULL OR t.last_summer_reminder_year < ?)`
    ).all(year);
    const link = tireBookingLink();
    for (const t of rows) {
      const text = `Guten Tag ${t.first_name} ${t.last_name},

die warme Jahreszeit naht. Für Ihr Fahrzeug (${t.license_plate}) lagern bei uns Ihre Sommerkompletträder.

Bitte vereinbaren Sie einen Termin zum Radwechsel – idealerweise bevor die Temperaturen dauerhaft steigen.
${link ? `\nDirekt online buchen:\n${link}\n` : ''}
Telefon: ${workshopPhone()}

Mit freundlichen Grüßen
${workshopName()}
${workshopAddress()}`;
      try {
        if (!transport) {
          console.log('[Reifen Sommer E-Mail dry-run]', t.email, text.slice(0, 200));
          continue;
        }
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'no-reply@werkstatt.local',
          to: t.email,
          subject: `Sommerreifen – Termin für Radwechsel | ${workshopName()}`,
          text,
        });
        db.prepare(
          "UPDATE tire_storage SET last_summer_reminder_year = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(year, t.id);
        sent++;
      } catch (e) {
        console.error('[Reifen Sommer E-Mail]', t.id, e.message);
      }
    }
  }

  return sent;
}

export function startReminderScheduler() {
  cron.schedule('*/5 * * * *', () => {
    processPendingReminders().catch((e) => console.error('Reminder-Cron:', e));
  });
  cron.schedule('12 7 * * *', () => {
    processSeasonalTireReminders().then((n) => {
      if (n) console.log(`🛞 Reifen-Saison-E-Mails: ${n} versendet (oder dry-run)`);
    }).catch((e) => console.error('Reifen-Saison-Cron:', e));
  });
  console.log(`🔔 Erinnerungs-Scheduler gestartet (alle 5 Min., ${hoursBefore()}h vorher; Reifen-Saison täglich 07:12)`);
}
