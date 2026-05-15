import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db.js';

const PREFIX = 'wk_live_';

export function generateApiKey() {
  const rnd = crypto.randomBytes(24).toString('base64url');
  const fullKey = `${PREFIX}${rnd}`;
  const visiblePrefix = fullKey.slice(0, 12); // "wk_live_XXXX" – sichtbare 4 Zeichen
  const hash = bcrypt.hashSync(fullKey, 10);
  return { fullKey, visiblePrefix, hash };
}

export function verifyApiKey(fullKey) {
  if (!fullKey || !fullKey.startsWith(PREFIX)) return null;
  const rows = db.prepare('SELECT * FROM api_keys WHERE active = 1').all();
  for (const r of rows) {
    try {
      if (bcrypt.compareSync(fullKey, r.key_hash)) {
        db.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?').run(r.id);
        return r;
      }
    } catch { /* ignore */ }
  }
  return null;
}

export function parseScopes(row) {
  try { return JSON.parse(row.scopes || '[]'); } catch { return []; }
}
