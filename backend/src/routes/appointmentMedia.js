import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, '..', '..', 'data', 'appointment-media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

function saveDataUrl(dataUrl, prefix) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].split('/')[1].split('+')[0] || 'jpg';
  const fname = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, fname), Buffer.from(m[2], 'base64'));
  return `/api/appointments/media-files/${fname}`;
}

export const mediaRouter = Router({ mergeParams: true });
mediaRouter.use(requireAuth);

mediaRouter.get('/', (req, res) => {
  const aid = Number(req.params.id);
  const rows = db.prepare(
    `SELECT m.*, u.full_name AS created_by_name
       FROM appointment_media m
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.appointment_id = ?
      ORDER BY m.id DESC`
  ).all(aid);
  res.json(rows);
});

mediaRouter.post('/', (req, res) => {
  const aid = Number(req.params.id);
  const ap = db.prepare('SELECT id FROM appointments WHERE id = ?').get(aid);
  if (!ap) return res.status(404).json({ error: 'Termin nicht gefunden' });
  const { image, kind = 'annahme', caption } = req.body || {};
  const url = saveDataUrl(image, `ap-${aid}`);
  if (!url) return res.status(400).json({ error: 'Bild (Data-URL) erforderlich' });
  if (!['annahme', 'reparatur', 'uebergabe', 'sonstiges'].includes(kind)) {
    return res.status(400).json({ error: 'kind ungültig' });
  }
  const info = db.prepare(
    `INSERT INTO appointment_media (appointment_id, kind, file_url, caption, created_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(aid, kind, url, caption || null, req.user?.id || null);
  res.status(201).json(db.prepare(
    `SELECT m.*, u.full_name AS created_by_name FROM appointment_media m
      LEFT JOIN users u ON u.id = m.created_by WHERE m.id = ?`
  ).get(info.lastInsertRowid));
});

mediaRouter.get('/:mediaId/raw', (req, res) => {
  const mid = Number(req.params.mediaId);
  const aid = Number(req.params.id);
  const row = db.prepare('SELECT * FROM appointment_media WHERE id = ? AND appointment_id = ?').get(mid, aid);
  if (!row) return res.status(404).end();
  const name = (row.file_url || '').split('/').pop();
  const safe = (name || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const p = path.join(MEDIA_DIR, safe);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

mediaRouter.delete('/:mediaId', (req, res) => {
  const mid = Number(req.params.mediaId);
  const row = db.prepare('SELECT * FROM appointment_media WHERE id = ?').get(mid);
  if (!row || row.appointment_id !== Number(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
  const name = (row.file_url || '').split('/').pop();
  if (name) {
    const p = path.join(MEDIA_DIR, name.replace(/[^a-zA-Z0-9._-]/g, ''));
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM appointment_media WHERE id = ?').run(mid);
  res.json({ success: true });
});
