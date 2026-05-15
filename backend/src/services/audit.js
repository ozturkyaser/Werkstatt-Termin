import db from '../db.js';

/**
 * Schreibt einen Audit-Eintrag (fehlertolerant).
 */
export function logAudit({
  userId = null,
  action,
  entityType,
  entityId = null,
  payload = null,
  ip = null,
}) {
  try {
    const json = payload != null ? JSON.stringify(payload).slice(0, 8000) : null;
    db.prepare(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, payload_json, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, action, entityType, entityId, json, ip);
  } catch (e) {
    console.error('[audit]', e.message);
  }
}
