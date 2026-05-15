import fs from 'node:fs';
import crypto from 'node:crypto';
import { paths } from '../loadRuntimeConfig.js';

function readRuntimeJson() {
  if (!fs.existsSync(paths.runtimePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(paths.runtimePath, 'utf8'));
  } catch {
    return null;
  }
}

export function isRuntimeConfigComplete() {
  const j = readRuntimeJson();
  if (!j) return false;
  return Boolean(String(j.JWT_SECRET || '').trim().length >= 16 && String(j.FRONTEND_URL || '').trim());
}

export function isSetupWizardActive() {
  if (fs.existsSync(paths.setupCompletePath)) return false;
  if (isRuntimeConfigComplete()) return false;
  return true;
}

export function readSetupToken() {
  if (!fs.existsSync(paths.setupTokenPath)) return null;
  return fs.readFileSync(paths.setupTokenPath, 'utf8').trim();
}

export function validateSetupToken(token) {
  const expected = readSetupToken();
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(String(token).trim(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Beim Serverstart: Einmal-Token erzeugen und URL ins Log schreiben. */
export function initSetupWizard() {
  if (isRuntimeConfigComplete()) {
    if (!fs.existsSync(paths.setupCompletePath)) {
      try {
        fs.writeFileSync(paths.setupCompletePath, new Date().toISOString(), 'utf8');
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(paths.setupTokenPath)) fs.unlinkSync(paths.setupTokenPath);
    } catch {
      /* ignore */
    }
    return;
  }
  if (!isSetupWizardActive()) return;
  if (!fs.existsSync(paths.setupTokenPath)) {
    const token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(paths.setupTokenPath, token, 'utf8');
  }
  const token = readSetupToken();
  const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const pathHint = base ? `${base}/einrichtung?token=${token}` : `/einrichtung?token=${token}  (PUBLIC_APP_URL in .env.docker setzen für volle URL im Log)`;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📋 Ersteinrichtung: Wizard im Browser öffnen');
  console.log(`  ${pathHint}`);
  console.log('  Token alternativ: Datei .setup_token im Datenverzeichnis (Volume)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
