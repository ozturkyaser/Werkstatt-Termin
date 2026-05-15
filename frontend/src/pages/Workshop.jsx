import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const WEEKDAYS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

export default function Workshop() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [hours, setHours] = useState([]);
  const [closures, setClosures] = useState([]);
  const [newClosure, setNewClosure] = useState({ date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [h, c] = await Promise.all([api.get('/workshop/hours'), api.get('/workshop/closures')]);
    // 7 Einträge garantiert, für fehlende Wochentage leer:
    const byWd = {};
    for (const r of h) byWd[r.weekday] = r;
    const full = [];
    for (let wd = 0; wd <= 6; wd++) {
      full.push(byWd[wd] || { weekday: wd, open_time: '09:00', close_time: '18:00', closed: wd >= 5 ? 1 : 0 });
    }
    setHours(full);
    setClosures(c);
  };
  useEffect(() => { load(); }, []);

  const saveHours = async () => {
    setSaving(true); setMsg('');
    try {
      await api.put('/workshop/hours', { hours });
      setMsg('Öffnungszeiten gespeichert.');
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const addClosure = async (e) => {
    e.preventDefault();
    if (!newClosure.date) return;
    await api.post('/workshop/closures', newClosure);
    setNewClosure({ date: '', reason: '' });
    load();
  };
  const removeClosure = async (id) => {
    await api.del(`/workshop/closures/${id}`);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Werkstatt-Zeiten</h1>
      <p className="text-sm text-slate-500 mb-6">
        Öffnungszeiten der gesamten Werkstatt. Individuelle Arbeitszeiten pro Mitarbeiter werden im Mitarbeiter-Profil gepflegt.
      </p>

      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Regelmäßige Öffnungszeiten</h2>
        <div className="space-y-3">
          {hours.map((h, idx) => (
            <div key={h.weekday} className="flex items-center gap-3">
              <div className="w-28 font-medium">{WEEKDAYS[h.weekday]}</div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!h.closed}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    const copy = [...hours];
                    copy[idx] = { ...h, closed: e.target.checked ? 0 : 1 };
                    setHours(copy);
                  }} />
                <span>Geöffnet</span>
              </label>
              <input type="time" className="input w-28" disabled={!isAdmin || h.closed}
                value={h.open_time || '09:00'}
                onChange={(e) => {
                  const copy = [...hours]; copy[idx] = { ...h, open_time: e.target.value }; setHours(copy);
                }} />
              <span className="text-slate-400">–</span>
              <input type="time" className="input w-28" disabled={!isAdmin || h.closed}
                value={h.close_time || '18:00'}
                onChange={(e) => {
                  const copy = [...hours]; copy[idx] = { ...h, close_time: e.target.value }; setHours(copy);
                }} />
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="mt-4 flex justify-end gap-3 items-center">
            {msg && <span className="text-sm text-slate-600">{msg}</span>}
            <button className="btn-primary" onClick={saveHours} disabled={saving}>
              {saving ? 'Speichere…' : 'Öffnungszeiten speichern'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Schließtage & Feiertage</h2>

        {isAdmin && (
          <form onSubmit={addClosure} className="flex gap-3 mb-4">
            <input type="date" className="input" required
              value={newClosure.date}
              onChange={(e) => setNewClosure({ ...newClosure, date: e.target.value })} />
            <input type="text" className="input flex-1" placeholder="Anlass (z.B. Weihnachten, Betriebsferien)"
              value={newClosure.reason}
              onChange={(e) => setNewClosure({ ...newClosure, reason: e.target.value })} />
            <button className="btn-primary">Hinzufügen</button>
          </form>
        )}

        {closures.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Schließtage hinterlegt.</div>
        ) : (
          <ul className="divide-y">
            {closures.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {new Date(c.date).toLocaleDateString('de-DE', { dateStyle: 'full' })}
                  </div>
                  {c.reason && <div className="text-sm text-slate-500">{c.reason}</div>}
                </div>
                {isAdmin && (
                  <button className="btn-ghost text-rose-600 text-sm" onClick={() => removeClosure(c.id)}>
                    Entfernen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
