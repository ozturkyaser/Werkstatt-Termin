/**
 * Lädt .env aus dem Backend-Verzeichnis und optional runtime.config.json aus dem Daten-Ordner
 * (Docker: /app/data). Muss vor allen Imports geladen werden, die process.env lesen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config();

function resolveDataDir() {
  const raw = process.env.DATABASE_PATH || path.join(rootDir, 'data', 'werkstatt.sqlite');
  const abs = path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
  return path.dirname(abs);
}

const dataDir = resolveDataDir();
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch {
  /* ignore */
}

const runtimePath = path.join(dataDir, 'runtime.config.json');
const setupTokenPath = path.join(dataDir, '.setup_token');
const setupCompletePath = path.join(dataDir, '.setup_complete');

if (fs.existsSync(runtimePath)) {
  try {
    const j = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    for (const [k, v] of Object.entries(j)) {
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        process.env[k] = String(v).trim();
      }
    }
  } catch (e) {
    console.error('[runtime.config.json]', e.message);
  }
}

export const paths = { dataDir, runtimePath, setupTokenPath, setupCompletePath };
