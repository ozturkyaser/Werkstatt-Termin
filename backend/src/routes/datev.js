import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildBuchungsstapel, previewBookings, loadDatevConfig, ACCOUNT_PRESETS } from '../services/datev.js';

const router = Router();
router.use(requireAuth);

// Kontenrahmen-Presets (für die UI)
router.get('/account-presets', (_req, res) => {
  res.json(ACCOUNT_PRESETS);
});

// Aktuelle Config zurückliefern (mergen mit Settings)
router.get('/config', (_req, res) => {
  res.json(loadDatevConfig());
});

// Vorschau der Buchungen
router.post('/preview', requireRole('admin'), (req, res) => {
  try {
    const cfg = loadDatevConfig();
    const opts = { ...cfg, ...req.body };
    const rows = previewBookings(opts);
    const sum = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    res.json({ count: rows.length, sum: Math.round(sum * 100) / 100, rows: rows.slice(0, 500) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DATEV-Export: CSV-Download
router.post('/export', requireRole('admin'), (req, res) => {
  try {
    const cfg = loadDatevConfig();
    const opts = { ...cfg, ...req.body };
    const { buffer, stats } = buildBuchungsstapel(opts);

    const fromShort = (opts.from || '').replace(/-/g, '');
    const toShort = (opts.to || '').replace(/-/g, '');
    const filename = `EXTF_Buchungsstapel_${fromShort}-${toShort}.csv`;

    res.setHeader(
      'Content-Type',
      stats.encoding === 'utf8' ? 'text/csv; charset=utf-8' : 'text/csv; charset=windows-1252'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Datev-Stats', JSON.stringify(stats));
    res.send(buffer);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
