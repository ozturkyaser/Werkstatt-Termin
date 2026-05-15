import { useMemo, useState } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';

// Einfache CSV-Parser: unterstützt ; und , als Separator, "..." und ""-Escape
function parseCSV(text) {
  const t = text.replace(/^\ufeff/, '');
  // Erste nicht-leere Zeile analysieren, um Separator zu erraten
  const firstLine = t.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { cur.push(field); field = ''; }
      else if (ch === '\r') { /* ignore */ }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  // leere Trailing-Zeilen entfernen
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const TARGET_FIELDS = [
  { key: 'internal_code', label: 'Code (ID)', aliases: ['internal_code', 'id', 'code', 'kuerzel'] },
  { key: 'name', label: 'Name *', required: true, aliases: ['name', 'bezeichnung', 'leistung', 'title'] },
  { key: 'category', label: 'Kategorie', aliases: ['category', 'kategorie', 'gruppe'] },
  { key: 'description', label: 'Beschreibung', aliases: ['description', 'beschreibung', 'info', 'umfang'] },
  { key: 'duration_min_minutes', label: 'Arbeitszeit Min (Min.)', aliases: ['durationminminutes', 'arbeitszeitmin', 'minzeit', 'zeitmin'] },
  { key: 'duration_max_minutes', label: 'Arbeitszeit Max (Min.)', aliases: ['durationmaxminutes', 'arbeitszeitmax', 'maxzeit', 'zeitmax', 'duration', 'dauer'] },
  { key: 'duration_minutes', label: 'Dauer gesamt (Min.)', aliases: ['durationminutes', 'dauerminuten', 'minuten'] },
  { key: 'buffer_before_minutes', label: 'Puffer vor (Min.)', aliases: ['bufferbeforeminutes', 'puffervor', 'vor'] },
  { key: 'buffer_after_minutes', label: 'Puffer nach (Min.)', aliases: ['bufferafterminutes', 'puffernach', 'nach'] },
  { key: 'complexity', label: 'Komplexität (1–4)', aliases: ['complexity', 'komplexitaet', 'komplex'] },
  { key: 'color', label: 'Farbe (HEX)', aliases: ['color', 'farbe', 'farbehex'] },
  { key: 'price', label: 'Preis', aliases: ['price', 'preis', 'betrag', 'kosten'] },
  { key: 'required_bay_type', label: 'Bühnen-Typ', aliases: ['requiredbaytype', 'baytype', 'buehne', 'hebebuehne'] },
  { key: 'required_skills', label: 'Skills (Komma/Pipe)', aliases: ['requiredskills', 'skills', 'qualifikationen'] },
  { key: 'online_bookable', label: 'Online buchbar (1/0)', aliases: ['onlinebookable', 'online', 'buchbar'] },
  { key: 'notes', label: 'Hinweise', aliases: ['notes', 'hinweise', 'hinweis', 'bemerkung'] },
  { key: 'active', label: 'Aktiv (1/0)', aliases: ['active', 'aktiv', 'status'] },
];

function autoMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const normalized = String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const f of TARGET_FIELDS) {
      if (f.aliases.some((a) => a.replace(/[^a-z0-9]/g, '') === normalized)) {
        map[f.key] = i;
        return;
      }
    }
  });
  return map;
}

export default function ServicesImportDialog({ onClose, onDone }) {
  const [rawRows, setRawRows] = useState(null); // [[...],[...]]
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState({});
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState('upsert');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const headers = rawRows && hasHeader ? rawRows[0] : rawRows ? rawRows[0].map((_, i) => `Spalte ${i + 1}`) : [];
  const dataRows = rawRows ? (hasHeader ? rawRows.slice(1) : rawRows) : [];

  const mappedPreview = useMemo(() => {
    if (!rawRows) return [];
    return dataRows.slice(0, 10).map((row) => {
      const obj = {};
      for (const f of TARGET_FIELDS) {
        const idx = mapping[f.key];
        obj[f.key] = idx !== undefined && idx >= 0 ? row[idx] : undefined;
      }
      return obj;
    });
  }, [rawRows, dataRows, mapping]);

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    const rows = parseCSV(text);
    setRawRows(rows);
    setResult(null);
    if (rows.length) {
      const firstLine = rows[0];
      // Header erkennen: wenn Zeile 1 non-numerisch und Zeile 2 existiert
      const looksLikeHeader = firstLine.every((c) => isNaN(parseFloat(c)));
      setHasHeader(looksLikeHeader);
      setMapping(looksLikeHeader ? autoMap(firstLine) : {});
    }
  }

  async function handleImport() {
    if (!rawRows) return;
    const items = dataRows
      .map((row) => {
        const obj = {};
        for (const f of TARGET_FIELDS) {
          const idx = mapping[f.key];
          if (idx !== undefined && idx >= 0) obj[f.key] = row[idx];
        }
        return obj;
      })
      .filter((o) => o.name && String(o.name).trim());

    if (items.length === 0) {
      alert('Keine importierbaren Zeilen – bitte Spalte "Name" zuweisen.');
      return;
    }

    setLoading(true);
    try {
      const r = await api.post('/services/import', { rows: items, mode });
      setResult(r);
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  const nameMapped = mapping.name !== undefined && mapping.name >= 0;

  return (
    <Modal open title="Dienstleistungen importieren" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Datei-Upload */}
        {!rawRows && (
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
            <div className="text-4xl mb-2">📄</div>
            <div className="font-medium mb-1">CSV-Datei hochladen</div>
            <div className="text-sm text-slate-500 mb-4">
              Unterstützt: Komma oder Semikolon als Trenner · UTF-8 · Anführungszeichen
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block mx-auto text-sm"
            />
            <div className="text-xs text-slate-400 mt-3">
              Beispiel-Spalten: name · description · category · duration_minutes · price · buffer_minutes · required_bay_type · required_skills · online_bookable · active
            </div>
          </div>
        )}

        {rawRows && !result && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <strong>{fileName}</strong> – {dataRows.length} Zeilen erkannt
              </div>
              <button
                className="btn-ghost text-xs"
                onClick={() => { setRawRows(null); setFileName(''); setMapping({}); setResult(null); }}
              >
                Andere Datei wählen
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              Erste Zeile enthält Spaltennamen
            </label>

            <div>
              <h3 className="font-semibold text-sm mb-2">Spalten zuordnen</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                {TARGET_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-sm w-40">{f.label}</label>
                    <select
                      className="input flex-1 text-sm"
                      value={mapping[f.key] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [f.key]: e.target.value === '' ? undefined : Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">— nicht zuordnen —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Spalte ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Vorschau (erste 10 Zeilen)</h3>
              <div className="overflow-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {TARGET_FIELDS.map((f) => (
                        <th key={f.key} className="text-left px-2 py-1.5 font-medium">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mappedPreview.map((row, i) => (
                      <tr key={i}>
                        {TARGET_FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-1 whitespace-nowrap max-w-[220px] truncate">
                            {row[f.key] ?? <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Importmodus</h3>
              <div className="flex gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={mode === 'upsert'}
                    onChange={() => setMode('upsert')}
                  />
                  Upsert (vorhandene per Name aktualisieren)
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={mode === 'create_only'}
                    onChange={() => setMode('create_only')}
                  />
                  Nur neue anlegen
                </label>
              </div>
            </div>

            {!nameMapped && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                Die Spalte <strong>Name</strong> muss zugeordnet werden.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={!nameMapped || loading}
              >
                {loading ? 'Importiere…' : `${dataRows.length} Zeilen importieren`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="card p-4 bg-emerald-50 border-emerald-200">
              <div className="font-semibold text-emerald-800">Import abgeschlossen</div>
              <div className="text-sm mt-1 grid grid-cols-4 gap-2">
                <div><span className="text-slate-500">Gesamt:</span> <strong>{result.total}</strong></div>
                <div className="text-emerald-700"><span className="text-slate-500">Neu:</span> <strong>{result.created}</strong></div>
                <div className="text-blue-700"><span className="text-slate-500">Aktualisiert:</span> <strong>{result.updated}</strong></div>
                <div className="text-amber-700"><span className="text-slate-500">Übersprungen:</span> <strong>{result.skipped}</strong></div>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <div className="card p-3 bg-rose-50 border-rose-200 max-h-48 overflow-auto">
                <div className="font-semibold text-rose-800 text-sm mb-1">Fehler ({result.errors.length}):</div>
                <ul className="text-xs space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>Zeile {e.row}: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button className="btn-primary" onClick={onDone}>Fertig</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
