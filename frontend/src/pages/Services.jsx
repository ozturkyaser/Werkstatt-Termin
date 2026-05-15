import { useCallback, useEffect, useState } from 'react';
import { api, formatCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ServicesImportDialog from '../components/ServicesImportDialog';

export default function Services() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(() => {
    api.get('/services?active=all').then(setRows);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(s) {
    await api.put(`/services/${s.id}`, { active: s.active ? 0 : 1 });
    load();
  }

  const byCat = rows.reduce((acc, s) => {
    const k = s.category || 'Sonstiges';
    (acc[k] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dienstleistungen</h1>
          <p className="text-slate-500 text-sm">Katalog aller Werkstattleistungen.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <a
              className="btn-ghost"
              href={`/api/services/export/csv?t=${Date.now()}`}
              onClick={async (e) => {
                e.preventDefault();
                const res = await fetch('/api/services/export/csv', {
                  headers: { Authorization: `Bearer ${localStorage.getItem('werkstatt_token')}` },
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dienstleistungen-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              ⬇ CSV-Export
            </a>
            <button className="btn-ghost" onClick={() => setShowImport(true)}>⬆ CSV-Import</button>
            <button className="btn-primary" onClick={() => setEditing({})}>+ Neue Leistung</button>
          </div>
        )}
      </div>

      {showImport && (
        <ServicesImportDialog
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}

      <div className="space-y-4">
        {Object.entries(byCat).map(([cat, list]) => {
          const catColor = list[0]?.color || '#64748b';
          return (
            <div key={cat} className="card">
              <div
                className="px-4 py-2 border-b font-semibold flex items-center gap-2"
                style={{ background: catColor + '15', borderLeft: `4px solid ${catColor}` }}
              >
                <span>{cat}</span>
                <span className="text-xs text-slate-500 font-normal">({list.length})</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {list.map((s) => (
                    <tr key={s.id} className={`hover:bg-slate-50 ${!s.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: s.color || '#64748b' }}
                          />
                          {s.internal_code && (
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {s.internal_code}
                            </span>
                          )}
                          <span className="font-medium">{s.name}</span>
                          {s.complexity && (
                            <span
                              title={`Komplexität ${s.complexity}/4`}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                s.complexity === 1 ? 'bg-emerald-100 text-emerald-800' :
                                s.complexity === 2 ? 'bg-blue-100 text-blue-800' :
                                s.complexity === 3 ? 'bg-amber-100 text-amber-800' :
                                'bg-rose-100 text-rose-800'
                              }`}
                            >
                              K{s.complexity}
                            </span>
                          )}
                          {!s.online_bookable && (
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">offline</span>
                          )}
                          {s.required_bay_type === 'hebebuehne' && (
                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded" title="Hebebühne erforderlich">🏗️</span>
                          )}
                        </div>
                        {s.description && <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>}
                        {s.notes && <div className="text-[11px] text-slate-400 italic mt-0.5">💡 {s.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                        {s.duration_min_minutes && s.duration_max_minutes && s.duration_min_minutes !== s.duration_max_minutes ? (
                          <>
                            <div>{s.duration_min_minutes}–{s.duration_max_minutes} Min</div>
                            <div className="text-slate-400">
                              +{(s.buffer_before_minutes || 0) + (s.buffer_after_minutes || 0)} Min Puffer
                            </div>
                          </>
                        ) : (
                          <div>{s.duration_minutes} Min</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                        {s.price > 0 ? formatCurrency(s.price) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                          <button className="btn-ghost text-sm" onClick={() => setEditing(s)}>Bearbeiten</button>
                          <button className="btn-ghost text-sm" onClick={() => toggle(s)}>
                            {s.active ? 'Aus' : 'An'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)}
        title={editing?.id ? 'Leistung bearbeiten' : 'Neue Leistung'}>
        {editing && (
          <ServiceForm initial={editing.id ? editing : null}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }} />
        )}
      </Modal>
    </div>
  );
}

const BAY_TYPES = [
  { value: '', label: '— beliebig —' },
  { value: 'hebebuehne', label: 'Hebebühne' },
  { value: 'ev_hebebuehne', label: 'EV-Hebebühne (HV)' },
  { value: 'platz', label: 'Arbeitsplatz' },
  { value: 'spezial', label: 'Spezial-Bühne' },
];

const SKILL_PRESETS = ['hv', 'hu', 'karosserie', 'diagnose', 'klima', 'getriebe'];

function ServiceForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({
    internal_code: initial?.internal_code || '',
    name: initial?.name || '',
    category: initial?.category || '',
    description: initial?.description || '',
    notes: initial?.notes || '',
    duration_min_minutes: initial?.duration_min_minutes || '',
    duration_max_minutes: initial?.duration_max_minutes || '',
    duration_minutes: initial?.duration_minutes || 60,
    price: initial?.price || 0,
    buffer_before_minutes: initial?.buffer_before_minutes || 0,
    buffer_after_minutes: initial?.buffer_after_minutes || 0,
    buffer_minutes: initial?.buffer_minutes || 0,
    complexity: initial?.complexity || 2,
    color: initial?.color || '#64748b',
    required_bay_type: initial?.required_bay_type || '',
    required_skills: Array.isArray(initial?.required_skills) ? initial.required_skills : [],
    online_bookable: initial?.online_bookable ?? 1,
  });
  const [err, setErr] = useState('');

  async function save(e) {
    e.preventDefault();
    try {
      const payload = {
        ...f,
        required_bay_type: f.required_bay_type || null,
        duration_min_minutes: f.duration_min_minutes === '' ? null : Number(f.duration_min_minutes),
        duration_max_minutes: f.duration_max_minutes === '' ? null : Number(f.duration_max_minutes),
        duration_minutes: Number(f.duration_max_minutes || f.duration_minutes) || 60,
        buffer_minutes: Number(f.buffer_before_minutes || 0) + Number(f.buffer_after_minutes || 0),
      };
      if (initial) await api.put(`/services/${initial.id}`, payload);
      else await api.post('/services', payload);
      onSaved?.();
    } catch (er) { setErr(er.message); }
  }
  const upd = (k, v) => setF((old) => ({ ...old, [k]: v }));
  const toggleSkill = (s) => upd('required_skills',
    f.required_skills.includes(s) ? f.required_skills.filter((x) => x !== s) : [...f.required_skills, s]);

  return (
    <form onSubmit={save} className="space-y-3">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Code (intern)</label>
          <input className="input font-mono text-sm" value={f.internal_code}
            onChange={(e) => upd('internal_code', e.target.value)} placeholder="z.B. INSP-01" /></div>
        <div className="col-span-2"><label className="label">Name *</label>
          <input className="input" required value={f.name} onChange={(e) => upd('name', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Kategorie</label>
          <input className="input" value={f.category} onChange={(e) => upd('category', e.target.value)} /></div>
        <div><label className="label">Farbe (Kalender)</label>
          <div className="flex gap-2">
            <input type="color" className="h-10 w-14 rounded border" value={f.color || '#64748b'}
              onChange={(e) => upd('color', e.target.value)} />
            <input className="input font-mono text-sm flex-1" value={f.color || ''}
              onChange={(e) => upd('color', e.target.value)} placeholder="#64748b" />
          </div>
        </div>
      </div>
      <div><label className="label">Beschreibung</label>
        <textarea className="input" value={f.description} onChange={(e) => upd('description', e.target.value)} /></div>
      <div><label className="label">Hinweise (intern)</label>
        <input className="input text-sm" value={f.notes} onChange={(e) => upd('notes', e.target.value)}
          placeholder="z.B. Spezialwerkzeug nötig" /></div>
      <div className="grid grid-cols-4 gap-3">
        <div><label className="label">Dauer Min</label>
          <input type="number" className="input" value={f.duration_min_minutes}
            onChange={(e) => upd('duration_min_minutes', e.target.value)} /></div>
        <div><label className="label">Dauer Max *</label>
          <input type="number" className="input" required value={f.duration_max_minutes || f.duration_minutes}
            onChange={(e) => upd('duration_max_minutes', e.target.value)} /></div>
        <div><label className="label">Puffer vor</label>
          <input type="number" className="input" value={f.buffer_before_minutes}
            onChange={(e) => upd('buffer_before_minutes', Number(e.target.value))} /></div>
        <div><label className="label">Puffer nach</label>
          <input type="number" className="input" value={f.buffer_after_minutes}
            onChange={(e) => upd('buffer_after_minutes', Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Komplexität (1–4)</label>
          <select className="input" value={f.complexity} onChange={(e) => upd('complexity', Number(e.target.value))}>
            <option value={1}>1 – Einfach (z.B. Ölwechsel)</option>
            <option value={2}>2 – Mittel (z.B. Bremsen)</option>
            <option value={3}>3 – Komplex (z.B. Stoßdämpfer)</option>
            <option value={4}>4 – Sehr komplex (z.B. Steuerkette)</option>
          </select>
        </div>
        <div><label className="label">Preis (€)</label>
          <input type="number" step="0.01" className="input" value={f.price}
            onChange={(e) => upd('price', Number(e.target.value))} /></div>
      </div>
      <div>
        <label className="label">Benötigter Bühnen-Typ</label>
        <select className="input" value={f.required_bay_type || ''}
          onChange={(e) => upd('required_bay_type', e.target.value)}>
          {BAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Benötigte Qualifikationen</label>
        <div className="flex flex-wrap gap-2">
          {SKILL_PRESETS.map((s) => (
            <button type="button" key={s} onClick={() => toggleSkill(s)}
              className={`px-3 py-1 rounded-full text-sm ${
                f.required_skills.includes(s) ? 'bg-brand-600 text-white' : 'bg-slate-100'
              }`}>{s}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 pt-2">
        <input type="checkbox" checked={!!f.online_bookable}
          onChange={(e) => upd('online_bookable', e.target.checked ? 1 : 0)} />
        <span className="text-sm">Online buchbar (Website/Telefon-KI)</span>
      </label>
      <div className="flex gap-2 pt-2 border-t">
        <button type="submit" className="btn-primary">Speichern</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
